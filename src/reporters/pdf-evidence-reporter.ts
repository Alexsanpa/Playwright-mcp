import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type LaunchOptions, type Page } from '@playwright/test';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { EVIDENCE_PREFIX } from '../utils/evidence';

export interface PdfEvidenceReporterOptions {
  /** Carpeta raíz de salida. Cada ejecución crea una subcarpeta con la fecha. Por defecto `evidence-report`. */
  outputDir?: string;
  /** Nombre del PDF consolidado. Por defecto `reporte-evidencias.pdf`. */
  fileName?: string;
  /** Generar el PDF consolidado con todos los casos. Por defecto `true`. */
  consolidated?: boolean;
  /** Generar además un PDF independiente por cada caso en la carpeta `casos/`. Por defecto `true`. */
  perTest?: boolean;
  /** Título que aparece en la portada. */
  title?: string;
  /** Nombre del proyecto / aplicación bajo prueba. */
  project?: string;
  /** Incluir también las capturas automáticas de Playwright (p. ej. `screenshot: 'only-on-failure'`). */
  includeAutoScreenshots?: boolean;
  /** Guardar también el HTML intermedio (útil para depurar el diseño del reporte). */
  keepHtml?: boolean;
  /** Opciones para lanzar el Chromium que imprime el PDF. */
  launchOptions?: LaunchOptions;
}

interface Image {
  caption: string;
  dataUri: string;
}

interface StepRecord {
  title: string;
  depth: number;
  duration: number;
  failed: boolean;
}

interface TestRecord {
  titlePath: string[];
  project: string;
  file: string;
  line: number;
  status: TestResult['status'];
  outcome: ReturnType<TestCase['outcome']>;
  duration: number;
  retry: number;
  tags: string[];
  error?: string;
  steps: StepRecord[];
  images: Image[];
  otherAttachments: string[];
}

const STATUS_LABEL: Record<string, string> = {
  passed: 'Exitoso',
  failed: 'Fallido',
  timedOut: 'Tiempo agotado',
  skipped: 'Omitido',
  interrupted: 'Interrumpido',
  flaky: 'Inestable',
};

/**
 * Reporter de Playwright que genera un PDF con las evidencias de la ejecución:
 * portada con resumen, y por cada test sus pasos, error (si lo hubo) y capturas.
 *
 * Uso en playwright.config.ts:
 *   reporter: [['./src/reporters/pdf-evidence-reporter.ts', { title: 'Mi reporte' }]]
 */
export default class PdfEvidenceReporter implements Reporter {
  private readonly options: PdfEvidenceReporterOptions;
  private readonly records = new Map<string, TestRecord>();
  private startTime = new Date();
  private rootDir = process.cwd();

  constructor(options: PdfEvidenceReporterOptions = {}) {
    this.options = options;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startTime = new Date();
    // `config.rootDir` apunta a testDir; las rutas se resuelven desde la carpeta del config.
    this.rootDir = config.configFile ? path.dirname(config.configFile) : process.cwd();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const [, projectName = '', ...titlePath] = test.titlePath();
    // Solo se conserva el último intento; los adjuntos se leen ahora porque
    // Playwright puede limpiar la carpeta de salida en reintentos posteriores.
    this.records.set(test.id, {
      titlePath: titlePath.slice(1),
      project: projectName,
      file: path.relative(this.rootDir, test.location.file),
      line: test.location.line,
      status: result.status,
      outcome: test.outcome(),
      duration: result.duration,
      retry: result.retry,
      tags: test.tags,
      error: result.errors.map((e) => stripAnsi(e.message ?? e.value ?? '')).join('\n\n') || undefined,
      steps: flattenSteps(result.steps),
      ...this.collectAttachments(result),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.records.size === 0) return;

    const runDir = path.resolve(this.rootDir, this.options.outputDir ?? 'evidence-report', timestamp(this.startTime));
    const records = this.sortedRecords();
    const browser = await chromium.launch(this.options.launchOptions);
    const page = await browser.newPage();

    try {
      if (this.options.consolidated ?? true) {
        const pdfPath = path.join(runDir, this.options.fileName ?? 'reporte-evidencias.pdf');
        await this.printPdf(page, this.renderReport(result, records), pdfPath, this.title);
        console.log(`\n📄 Reporte PDF consolidado: ${path.relative(process.cwd(), pdfPath)}`);
      }

      if (this.options.perTest ?? true) {
        const casesDir = path.join(runDir, 'casos');
        for (const [i, record] of records.entries()) {
          const caseName = record.titlePath[record.titlePath.length - 1] ?? 'caso';
          const fileName = `${String(i + 1).padStart(2, '0')}-${slugify(caseName)}-${slugify(record.project)}.pdf`;
          await this.printPdf(page, this.renderCase(record, i + 1), path.join(casesDir, fileName), `Evidencia · ${caseName}`);
        }
        console.log(`📄 PDF de evidencia por caso (${records.length}): ${path.relative(process.cwd(), casesDir)}`);
      }
    } finally {
      await browser.close();
    }
  }

  private async printPdf(page: Page, html: string, pdfPath: string, headerText: string): Promise<void> {
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    if (this.options.keepHtml) fs.writeFileSync(pdfPath.replace(/\.pdf$/, '.html'), html);
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#888;">${escapeHtml(headerText)}</div>`,
      footerTemplate:
        '<div style="font-size:8px;width:100%;padding:0 14mm;color:#888;text-align:right;">' +
        'Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    });
  }

  private sortedRecords(): TestRecord[] {
    return [...this.records.values()].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.project.localeCompare(b.project),
    );
  }

  private get title(): string {
    return this.options.title ?? 'Reporte de evidencias de pruebas';
  }

  private collectAttachments(result: TestResult): Pick<TestRecord, 'images' | 'otherAttachments'> {
    const images: Image[] = [];
    const otherAttachments: string[] = [];
    const includeAuto = this.options.includeAutoScreenshots ?? true;

    for (const attachment of result.attachments) {
      const isEvidence = attachment.name.startsWith(EVIDENCE_PREFIX);
      const isImage = attachment.contentType.startsWith('image/');

      if (isImage && (isEvidence || (includeAuto && attachment.name === 'screenshot'))) {
        const body = attachment.body ?? readIfExists(attachment.path);
        if (!body) continue;
        images.push({
          caption: isEvidence
            ? attachment.name.slice(EVIDENCE_PREFIX.length)
            : 'Captura final del caso (automática)',
          dataUri: `data:${attachment.contentType};base64,${body.toString('base64')}`,
        });
      } else if (attachment.path) {
        otherAttachments.push(`${attachment.name}: ${path.relative(this.rootDir, attachment.path)}`);
      }
    }
    return { images, otherAttachments };
  }

  /** Documento independiente con la evidencia de un único caso. */
  private renderCase(r: TestRecord, index: number): string {
    return htmlDocument(
      `Evidencia · ${r.titlePath[r.titlePath.length - 1] ?? ''}`,
      `
  <header class="case-header">
    <div class="eyebrow">${escapeHtml(this.title)}${this.options.project ? ` · ${escapeHtml(this.options.project)}` : ''}</div>
    <div class="muted">Ejecución: ${this.startTime.toLocaleString('es-ES')} · Caso ${index} de ${this.records.size}</div>
  </header>
  ${this.renderTest(r, index, true)}`,
    );
  }

  private renderReport(result: FullResult, records: TestRecord[]): string {
    const count = (outcome: TestRecord['outcome']) => records.filter((r) => r.outcome === outcome).length;
    const passed = count('expected');
    const failed = count('unexpected');
    const flaky = count('flaky');
    const skipped = count('skipped');
    const total = records.length;
    const successRate = total - skipped > 0 ? Math.round(((passed + flaky) / (total - skipped)) * 100) : 0;

    const summaryRows = records
      .map(
        (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.titlePath.join(' › '))}</td>
          <td>${escapeHtml(r.project)}</td>
          <td><span class="badge ${badgeClass(r)}">${statusLabel(r)}</span></td>
          <td class="num">${formatDuration(r.duration)}</td>
        </tr>`,
      )
      .join('');

    return htmlDocument(
      this.title,
      `
  <section class="cover">
    <h1>${escapeHtml(this.title)}</h1>
    ${this.options.project ? `<p class="subtitle">${escapeHtml(this.options.project)}</p>` : ''}
    <table class="meta">
      <tr><th>Fecha de ejecución</th><td>${this.startTime.toLocaleString('es-ES')}</td></tr>
      <tr><th>Duración total</th><td>${formatDuration(result.duration)}</td></tr>
      <tr><th>Resultado global</th><td><span class="badge ${result.status === 'passed' ? 'ok' : 'ko'}">${STATUS_LABEL[result.status] ?? result.status}</span></td></tr>
      <tr><th>Entorno</th><td>${escapeHtml(`${os.type()} ${os.release()} · Node ${process.version}`)}</td></tr>
      ${process.env.BASE_URL ? `<tr><th>URL base</th><td>${escapeHtml(process.env.BASE_URL)}</td></tr>` : ''}
    </table>

    <div class="kpis">
      ${kpi('Total', total, '')}
      ${kpi('Exitosos', passed, 'ok')}
      ${kpi('Fallidos', failed, 'ko')}
      ${kpi('Inestables', flaky, 'warn')}
      ${kpi('Omitidos', skipped, 'skip')}
      ${kpi('% Éxito', `${successRate}%`, '')}
    </div>

    <h2>Resumen de casos</h2>
    <table class="summary">
      <thead><tr><th>#</th><th>Caso de prueba</th><th>Proyecto</th><th>Estado</th><th>Duración</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </section>

  ${records.map((r, i) => this.renderTest(r, i + 1)).join('')}`,
    );
  }

  private renderTest(r: TestRecord, index: number, standalone = false): string {
    const steps = r.steps.length
      ? `<h3>Pasos</h3><ol class="steps">${r.steps
          .map(
            (s) =>
              `<li class="${s.failed ? 'step-ko' : ''}" style="margin-left:${s.depth * 16}px">` +
              `${s.failed ? '✗' : '✓'} ${escapeHtml(s.title)} <span class="muted">(${formatDuration(s.duration)})</span></li>`,
          )
          .join('')}</ol>`
      : '';

    const error = r.error ? `<h3>Error</h3><pre class="error">${escapeHtml(r.error)}</pre>` : '';

    const images = r.images.length
      ? `<h3>Evidencias (${r.images.length})</h3>${r.images
          .map(
            (img) => `
          <figure>
            <img src="${img.dataUri}" alt="${escapeHtml(img.caption)}">
            <figcaption>${escapeHtml(img.caption)}</figcaption>
          </figure>`,
          )
          .join('')}`
      : '<p class="muted">Sin evidencias capturadas para este caso.</p>';

    const others = r.otherAttachments.length
      ? `<h3>Otros adjuntos</h3><ul class="muted">${r.otherAttachments.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
      : '';

    return `
  <section class="test${standalone ? ' standalone' : ''}">
    <h2>${index}. ${escapeHtml(r.titlePath[r.titlePath.length - 1] ?? '')}</h2>
    <table class="meta">
      <tr><th>Suite</th><td>${escapeHtml(r.titlePath.slice(0, -1).join(' › ') || '-')}</td></tr>
      <tr><th>Archivo</th><td>${escapeHtml(r.file)}</td></tr>
      <tr><th>Proyecto</th><td>${escapeHtml(r.project)}</td></tr>
      <tr><th>Estado</th><td><span class="badge ${badgeClass(r)}">${statusLabel(r)}</span>${r.retry ? ` <span class="muted">(reintento ${r.retry})</span>` : ''}</td></tr>
      <tr><th>Duración</th><td>${formatDuration(r.duration)}</td></tr>
      ${r.tags.length ? `<tr><th>Etiquetas</th><td>${escapeHtml(r.tags.join(', '))}</td></tr>` : ''}
    </table>
    ${steps}
    ${error}
    ${images}
    ${others}
  </section>`;
  }
}

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>${body}
</body>
</html>`;
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'caso'
  );
}

function flattenSteps(steps: TestStep[], depth = 0): StepRecord[] {
  return steps
    .filter((s) => s.category === 'test.step')
    .flatMap((s) => [
      { title: s.title, depth, duration: s.duration, failed: !!s.error },
      ...flattenSteps(s.steps, depth + 1),
    ]);
}

function statusLabel(r: TestRecord): string {
  return r.outcome === 'flaky' ? STATUS_LABEL.flaky : (STATUS_LABEL[r.status] ?? r.status);
}

function badgeClass(r: TestRecord): string {
  switch (r.outcome) {
    case 'expected':
      return 'ok';
    case 'flaky':
      return 'warn';
    case 'skipped':
      return 'skip';
    default:
      return 'ko';
  }
}

function kpi(label: string, value: string | number, cls: string): string {
  return `<div class="kpi ${cls}"><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

function readIfExists(file?: string): Buffer | undefined {
  if (!file || !fs.existsSync(file)) return undefined;
  return fs.readFileSync(file);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2328; font-size: 11px; margin: 0; }
  h1 { font-size: 26px; margin: 0 0 4px; color: #1a4d8f; }
  h2 { font-size: 16px; color: #1a4d8f; border-bottom: 2px solid #1a4d8f; padding-bottom: 4px; margin: 18px 0 10px; }
  h3 { font-size: 12px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #57606a; }
  .subtitle { font-size: 14px; color: #57606a; margin: 0 0 16px; }
  .test { page-break-before: always; }
  .test.standalone { page-break-before: auto; }
  .case-header { border-bottom: 1px solid #d0d7de; padding-bottom: 8px; margin-bottom: 4px; }
  .case-header .eyebrow { font-size: 13px; font-weight: 600; color: #1a4d8f; }
  table { border-collapse: collapse; width: 100%; }
  table.meta th { text-align: left; width: 140px; color: #57606a; font-weight: 600; padding: 3px 8px 3px 0; vertical-align: top; }
  table.meta td { padding: 3px 0; }
  table.summary th, table.summary td { border: 1px solid #d0d7de; padding: 5px 6px; text-align: left; }
  table.summary thead th { background: #f0f4f9; }
  table.summary tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .kpis { display: flex; gap: 8px; margin: 18px 0; }
  .kpi { flex: 1; border: 1px solid #d0d7de; border-radius: 6px; padding: 10px; text-align: center; }
  .kpi .value { font-size: 20px; font-weight: 700; }
  .kpi .label { color: #57606a; font-size: 10px; text-transform: uppercase; }
  .kpi.ok .value { color: #1a7f37; } .kpi.ko .value { color: #cf222e; }
  .kpi.warn .value { color: #9a6700; } .kpi.skip .value { color: #6e7781; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-weight: 600; font-size: 10px; color: #fff; }
  .badge.ok { background: #1a7f37; } .badge.ko { background: #cf222e; }
  .badge.warn { background: #9a6700; } .badge.skip { background: #6e7781; }
  .steps { padding-left: 18px; margin: 0; }
  .steps li { margin: 2px 0; color: #1a7f37; }
  .steps li.step-ko { color: #cf222e; font-weight: 600; }
  .muted { color: #6e7781; font-weight: normal; }
  pre.error { background: #fff5f5; border: 1px solid #ffc1c0; border-radius: 4px; padding: 8px; white-space: pre-wrap; word-break: break-word; font-size: 9.5px; color: #82071e; }
  figure { margin: 10px 0 16px; page-break-inside: avoid; }
  figure img { max-width: 100%; max-height: 190mm; border: 1px solid #d0d7de; border-radius: 4px; display: block; }
  figcaption { margin-top: 4px; font-style: italic; color: #57606a; }
`;
