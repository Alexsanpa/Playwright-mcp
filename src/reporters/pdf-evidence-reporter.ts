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
import {
  CASE_ANNOTATION_PREFIX,
  EVIDENCE_PREFIX,
  STEP_ATTACHMENT,
  type StepRecordData,
} from '../utils/evidence';

export interface PdfEvidenceReporterOptions {
  /** Carpeta raíz de salida. Cada ejecución crea una subcarpeta con la fecha. Por defecto `evidence-report`. */
  outputDir?: string;
  /** Nombre del PDF consolidado. Por defecto `reporte-evidencias.pdf`. */
  fileName?: string;
  /** Generar el PDF consolidado con todos los casos. Por defecto `true`. */
  consolidated?: boolean;
  /** Generar además un PDF independiente por cada caso en la carpeta `casos/`. Por defecto `true`. */
  perTest?: boolean;
  /** Título del informe consolidado. */
  title?: string;
  /** Nombre del proyecto / aplicación bajo prueba. */
  project?: string;
  /** Nombre del ambiente (QA, UAT...). Por defecto `TEST_ENV` o `QA`. */
  environment?: string;
  /** Persona que ejecuta las pruebas. Por defecto `TESTER` o el usuario del sistema. */
  executedBy?: string;
  /** Versión / build de la aplicación bajo prueba. Por defecto `APP_VERSION`. */
  appVersion?: string;
  /** Incluir la captura automática de Playwright (`screenshot: 'on'`) como "estado final". */
  includeAutoScreenshots?: boolean;
  /** Incluir el bloque de firmas (ejecutado / revisado / aprobado). Por defecto `true`. */
  signatures?: boolean;
  /** Archivos de test que no se documentan. Por defecto el seed de los agentes (`seed.spec.ts`). */
  exclude?: RegExp;
  /** Guardar también el HTML intermedio (útil para depurar el diseño del reporte). */
  keepHtml?: boolean;
  /** Opciones para lanzar el Chromium que imprime el PDF. */
  launchOptions?: LaunchOptions;
}

interface EvidenceStep extends StepRecordData {
  image?: string;
}

interface CaseRecord {
  id: string;
  name: string;
  module: string;
  description?: string;
  preconditions: string[];
  priority?: string;
  requirement?: string;
  browser: string;
  baseURL?: string;
  project: string;
  file: string;
  line: number;
  tags: string[];
  status: TestResult['status'];
  outcome: ReturnType<TestCase['outcome']>;
  startTime: Date;
  duration: number;
  retry: number;
  error?: string;
  steps: EvidenceStep[];
  finalImage?: string;
  finalUrl?: string;
  otherAttachments: string[];
}

/**
 * Reporter de Playwright que genera documentos PDF de evidencia de ejecución con formato
 * de plantilla de QA: información general del caso, precondiciones, tabla de pasos
 * (resultado esperado vs. obtenido), pantallazo por paso, resultado y firmas.
 *
 * Genera un PDF consolidado y/o un PDF por caso en `evidence-report/<fecha>/`.
 */
export default class PdfEvidenceReporter implements Reporter {
  private readonly options: PdfEvidenceReporterOptions;
  private readonly records = new Map<string, CaseRecord>();
  private readonly baseURLs = new Map<string, string | undefined>();
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
    for (const project of config.projects) this.baseURLs.set(project.name, project.use.baseURL);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if ((this.options.exclude ?? /seed\.spec\.ts$/).test(test.location.file)) return;
    const [, projectName = '', , ...titlePath] = test.titlePath();
    const annotations = new Map<string, string>();
    for (const a of [...test.annotations, ...result.annotations]) {
      if (a.type.startsWith(CASE_ANNOTATION_PREFIX) && a.description) {
        annotations.set(a.type.slice(CASE_ANNOTATION_PREFIX.length), a.description);
      }
    }
    const title = titlePath[titlePath.length - 1] ?? '';

    // Solo se conserva el último intento; los adjuntos se leen ahora porque
    // Playwright puede limpiar la carpeta de salida en reintentos posteriores.
    this.records.set(test.id, {
      id: annotations.get('id') ?? '',
      name: capitalize(title.replace(/\s*@\S+/g, '').trim()),
      module: annotations.get('module') ?? (titlePath.slice(0, -1).join(' › ') || '-'),
      description: annotations.get('description'),
      preconditions: annotations.get('preconditions')?.split('\n').filter(Boolean) ?? [],
      priority: annotations.get('priority'),
      requirement: annotations.get('requirement'),
      browser: annotations.get('browser') ?? projectName,
      finalUrl: annotations.get('finalUrl'),
      baseURL: this.baseURLs.get(projectName),
      project: projectName,
      file: path.relative(this.rootDir, test.location.file),
      line: test.location.line,
      tags: test.tags,
      status: result.status,
      outcome: test.outcome(),
      startTime: result.startTime,
      duration: result.duration,
      retry: result.retry,
      error: result.errors.map((e) => stripAnsi(e.message ?? e.value ?? '')).join('\n\n') || undefined,
      ...this.collectEvidence(result),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.records.size === 0) return;

    const records = this.sortedRecords();
    records.forEach((r, i) => {
      if (!r.id) r.id = `CP-${String(i + 1).padStart(3, '0')}`;
    });

    const runDir = path.resolve(this.rootDir, this.options.outputDir ?? 'evidence-report', timestamp(this.startTime));
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
        for (const record of records) {
          const fileName = `${slugify(record.id)}-${slugify(record.name)}-${slugify(record.project)}.pdf`;
          await this.printPdf(
            page,
            htmlDocument(`Evidencia ${record.id}`, this.renderCase(record, true)),
            path.join(casesDir, fileName),
            `Evidencia de ejecución · ${record.id}`,
          );
        }
        console.log(`📄 PDF de evidencia por caso (${records.length}): ${path.relative(process.cwd(), casesDir)}`);
      }
    } finally {
      await browser.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Datos
  // ---------------------------------------------------------------------------

  private get title(): string {
    return this.options.title ?? 'Informe de ejecución de pruebas';
  }

  private get executedBy(): string {
    return this.options.executedBy ?? process.env.TESTER ?? safeUsername();
  }

  private get environment(): string {
    return this.options.environment ?? process.env.TEST_ENV ?? 'QA';
  }

  private get appVersion(): string | undefined {
    return this.options.appVersion ?? process.env.APP_VERSION;
  }

  private sortedRecords(): CaseRecord[] {
    return [...this.records.values()].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.project.localeCompare(b.project),
    );
  }

  private collectEvidence(result: TestResult): Pick<CaseRecord, 'steps' | 'finalImage' | 'otherAttachments'> {
    const images = new Map<string, string>();
    const stepData: StepRecordData[] = [];
    const otherAttachments: string[] = [];
    let finalImage: string | undefined;

    for (const attachment of result.attachments) {
      if (attachment.name === STEP_ATTACHMENT) {
        const body = attachment.body ?? readIfExists(attachment.path);
        if (body) stepData.push(JSON.parse(body.toString('utf8')) as StepRecordData);
      } else if (attachment.contentType.startsWith('image/')) {
        const body = attachment.body ?? readIfExists(attachment.path);
        if (!body) continue;
        const dataUri = `data:${attachment.contentType};base64,${body.toString('base64')}`;
        if (attachment.name.startsWith(EVIDENCE_PREFIX)) images.set(attachment.name, dataUri);
        else if (attachment.name === 'screenshot' && (this.options.includeAutoScreenshots ?? true)) finalImage = dataUri;
      } else if (attachment.path && attachment.name !== 'trace') {
        otherAttachments.push(`${attachment.name}: ${path.relative(this.rootDir, attachment.path)}`);
      }
    }

    // Casos que no usan `evidence.step`: se documentan con sus `test.step`.
    const steps: EvidenceStep[] = stepData.length
      ? stepData.map((s) => ({ ...s, image: s.screenshot ? images.get(s.screenshot) : undefined }))
      : flattenSteps(result.steps).map((s, i) => ({
          index: i + 1,
          action: s.title,
          status: s.error ? 'failed' : 'passed',
          actual: s.error ? 'El paso no se completó (ver observaciones).' : 'Resultado conforme a lo esperado.',
          url: '',
          timestamp: s.startTime.toISOString(),
        }));

    return { steps, finalImage, otherAttachments };
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private async printPdf(page: Page, html: string, pdfPath: string, headerText: string): Promise<void> {
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    if (this.options.keepHtml) fs.writeFileSync(pdfPath.replace(/\.pdf$/, '.html'), html);
    await page.setContent(html, { waitUntil: 'load' });
    const generated = `${formatDate(new Date())} ${formatTime(new Date())}`;
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate:
        '<div style="font-size:7.5px;width:100%;padding:0 14mm;color:#7a7f87;display:flex;justify-content:space-between;">' +
        `<span>${escapeHtml(headerText)}</span><span>${escapeHtml(this.options.project ?? '')}</span></div>`,
      footerTemplate:
        '<div style="font-size:7.5px;width:100%;padding:0 14mm;color:#7a7f87;display:flex;justify-content:space-between;">' +
        `<span>Documento generado el ${generated}</span>` +
        '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    });
  }

  private docHeader(code: string, subtitle: string): string {
    return `
    <table class="doc-header">
      <tr>
        <td class="logo" rowspan="2"><div>QA</div></td>
        <td class="doc-title">${escapeHtml(subtitle)}</td>
        <td class="doc-code"><span>Código</span>${escapeHtml(code)}</td>
      </tr>
      <tr>
        <td class="doc-project">${escapeHtml(this.options.project ?? 'Aplicación bajo prueba')}</td>
        <td class="doc-code"><span>Ambiente</span>${escapeHtml(this.environment)}</td>
      </tr>
    </table>`;
  }

  /** Documento de evidencia de un caso. */
  private renderCase(r: CaseRecord, standalone: boolean): string {
    const end = new Date(r.startTime.getTime() + r.duration);
    const passed = r.outcome === 'expected' || r.outcome === 'flaky';
    const skipped = r.outcome === 'skipped';
    const verdict = skipped ? 'NO EJECUTADO' : passed ? 'APROBADO' : 'FALLIDO';
    const verdictClass = skipped ? 'skip' : passed ? 'ok' : 'ko';
    let section = 0;
    const h = (text: string) => `<h2><span>${++section}.</span> ${text}</h2>`;

    const info = `
    ${h('Información general')}
    <table class="grid">
      <tr><th>ID del caso</th><td><b>${escapeHtml(r.id)}</b></td><th>Prioridad</th><td>${escapeHtml(r.priority ?? '-')}</td></tr>
      <tr><th>Nombre del caso</th><td colspan="3">${escapeHtml(r.name)}</td></tr>
      <tr><th>Módulo</th><td>${escapeHtml(r.module)}</td><th>Requisito / HU</th><td>${escapeHtml(r.requirement ?? '-')}</td></tr>
      <tr><th>Ejecutado por</th><td>${escapeHtml(this.executedBy)}</td><th>Fecha de ejecución</th><td>${formatDate(r.startTime)}</td></tr>
      <tr><th>Hora de inicio</th><td>${formatTime(r.startTime)}</td><th>Hora de fin</th><td>${formatTime(end)} <span class="muted">(${formatDuration(r.duration)})</span></td></tr>
      <tr><th>Ambiente</th><td>${escapeHtml(this.environment)}${r.baseURL ? `<br><span class="muted">${escapeHtml(r.baseURL)}</span>` : ''}</td><th>Navegador</th><td>${escapeHtml(r.browser)}</td></tr>
      <tr><th>Versión / build</th><td>${escapeHtml(this.appVersion ?? '-')}</td><th>Tipo de ejecución</th><td>Automatizada (Playwright)${r.retry ? ` · reintento ${r.retry}` : ''}</td></tr>
    </table>`;

    const description = r.description
      ? `${h('Objetivo del caso')}<p class="text">${escapeHtml(r.description)}</p>`
      : '';

    const preconditions = r.preconditions.length
      ? `${h('Precondiciones')}<ul class="text">${r.preconditions.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
      : '';

    const stepsTable = r.steps.length
      ? `${h('Pasos de ejecución')}
    <table class="steps">
      <thead><tr><th class="n">N°</th><th>Acción</th><th>Datos de prueba</th><th>Resultado esperado</th><th>Resultado obtenido</th><th class="st">Estado</th></tr></thead>
      <tbody>${r.steps
        .map(
          (s) => `
        <tr>
          <td class="n">${s.index}</td>
          <td>${escapeHtml(s.action)}</td>
          <td>${multiline(s.data ?? '-')}</td>
          <td>${multiline(s.expected ?? '-')}</td>
          <td>${multiline(s.actual ?? '-')}</td>
          <td class="st"><span class="chip ${s.status === 'passed' ? 'ok' : 'ko'}">${s.status === 'passed' ? '✔ Pasó' : '✘ Falló'}</span></td>
        </tr>`,
        )
        .join('')}</tbody>
    </table>`
      : '';

    let figure = 0;
    const evidenceFigures = r.steps
      .filter((s) => s.image)
      .map((s) =>
        screenshotFigure(
          ++figure,
          `Paso ${s.index} · ${s.action}`,
          s.image!,
          s.url,
          new Date(s.timestamp),
          s.status === 'passed',
        ),
      );
    // La captura final solo aporta si el caso falló o si ningún paso tiene pantallazo.
    const lastStepHasImage = !!r.steps[r.steps.length - 1]?.image;
    if (r.finalImage && (!passed || !lastStepHasImage)) {
      evidenceFigures.push(
        screenshotFigure(++figure, 'Estado final de la aplicación al terminar el caso', r.finalImage, r.finalUrl ?? '', end, passed),
      );
    }
    const evidences = `${h('Evidencias')}${
      evidenceFigures.length ? evidenceFigures.join('') : '<p class="muted">No se registraron capturas para este caso.</p>'
    }`;

    const observations = r.error
      ? `<pre class="error">${escapeHtml(summarizeError(r.error))}</pre>`
      : `<p class="text">${skipped ? 'El caso no se ejecutó en este ciclo.' : 'El caso se ejecutó sin incidencias; todos los resultados obtenidos coinciden con los esperados.'}</p>`;

    const outcome = `
    ${h('Resultado de la ejecución')}
    <table class="verdict">
      <tr>
        <td class="stamp ${verdictClass}">${verdict}</td>
        <td>
          <div class="obs-title">Observaciones</div>
          ${observations}
          ${r.otherAttachments.length ? `<div class="muted small">Adjuntos: ${r.otherAttachments.map(escapeHtml).join(' · ')}</div>` : ''}
        </td>
      </tr>
    </table>`;

    const signatures =
      standalone && (this.options.signatures ?? true) ? `${h('Firmas')}${this.signatureBlock()}` : '';

    return `
  <section class="case${standalone ? '' : ' break'}">
    ${this.docHeader(r.id, 'EVIDENCIA DE EJECUCIÓN DE PRUEBA')}
    ${info}
    ${description}
    ${preconditions}
    ${stepsTable}
    ${evidences}
    ${outcome}
    ${signatures}
  </section>`;
  }

  private signatureBlock(): string {
    const box = (role: string, name = '') => `
      <td>
        <div class="sign-line"></div>
        <div class="sign-role">${role}</div>
        <div class="sign-name">${escapeHtml(name) || 'Nombre:'}</div>
        <div class="sign-name">Fecha:</div>
      </td>`;
    return `<table class="signatures"><tr>${box('Ejecutado por', this.executedBy)}${box('Revisado por')}${box('Aprobado por')}</tr></table>`;
  }

  /** Informe consolidado: portada + resumen + evidencia de cada caso. */
  private renderReport(result: FullResult, records: CaseRecord[]): string {
    const count = (outcome: CaseRecord['outcome']) => records.filter((r) => r.outcome === outcome).length;
    const passed = count('expected');
    const failed = count('unexpected');
    const flaky = count('flaky');
    const skipped = count('skipped');
    const total = records.length;
    const executed = total - skipped;
    const successRate = executed > 0 ? Math.round(((passed + flaky) / executed) * 100) : 0;
    const baseURL = records.find((r) => r.baseURL)?.baseURL;

    const summaryRows = records
      .map((r) => {
        const ok = r.outcome === 'expected' || r.outcome === 'flaky';
        const label = r.outcome === 'skipped' ? 'No ejecutado' : ok ? 'Aprobado' : 'Fallido';
        const cls = r.outcome === 'skipped' ? 'skip' : ok ? 'ok' : 'ko';
        return `
        <tr>
          <td class="n">${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.module)}</td>
          <td>${escapeHtml(r.project)}</td>
          <td class="num">${formatDuration(r.duration)}</td>
          <td class="st"><span class="chip ${cls}">${label}</span></td>
        </tr>`;
      })
      .join('');

    const cover = `
  <section class="cover">
    ${this.docHeader(`EJEC-${timestamp(this.startTime)}`, this.title.toUpperCase())}
    <h2><span>1.</span> Datos de la ejecución</h2>
    <table class="grid">
      <tr><th>Proyecto</th><td>${escapeHtml(this.options.project ?? '-')}</td><th>Ambiente</th><td>${escapeHtml(this.environment)}</td></tr>
      <tr><th>Ejecutado por</th><td>${escapeHtml(this.executedBy)}</td><th>Fecha</th><td>${formatDate(this.startTime)}</td></tr>
      <tr><th>Hora de inicio</th><td>${formatTime(this.startTime)}</td><th>Duración total</th><td>${formatDuration(result.duration)}</td></tr>
      <tr><th>URL</th><td>${escapeHtml(baseURL ?? '-')}</td><th>Versión / build</th><td>${escapeHtml(this.appVersion ?? '-')}</td></tr>
      <tr><th>Equipo</th><td colspan="3">${escapeHtml(`${os.type()} ${os.release()} · Node ${process.version}`)}</td></tr>
    </table>

    <h2><span>2.</span> Resumen de resultados</h2>
    <div class="kpis">
      ${kpi('Casos', total, '')}
      ${kpi('Aprobados', passed + flaky, 'ok')}
      ${kpi('Fallidos', failed, 'ko')}
      ${kpi('No ejecutados', skipped, 'skip')}
      ${kpi('% de éxito', `${successRate}%`, successRate === 100 ? 'ok' : failed ? 'ko' : '')}
    </div>
    <div class="bar">
      <div class="ok" style="width:${pct(passed + flaky, total)}%"></div>
      <div class="ko" style="width:${pct(failed, total)}%"></div>
      <div class="skip" style="width:${pct(skipped, total)}%"></div>
    </div>

    <h2><span>3.</span> Casos ejecutados</h2>
    <table class="steps">
      <thead><tr><th class="n">ID</th><th>Caso de prueba</th><th>Módulo</th><th>Navegador</th><th>Duración</th><th class="st">Resultado</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>

    ${this.options.signatures ?? true ? `<h2><span>4.</span> Firmas</h2>${this.signatureBlock()}` : ''}
  </section>`;

    return htmlDocument(this.title, cover + records.map((r) => this.renderCase(r, false)).join(''));
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function screenshotFigure(n: number, caption: string, image: string, url: string, at: Date, ok: boolean): string {
  return `
    <figure>
      <div class="fig-title"><span>Figura ${n}.</span> ${escapeHtml(caption)} <span class="chip ${ok ? 'ok' : 'ko'}">${ok ? '✔' : '✘'}</span></div>
      <div class="browser">
        <div class="browser-bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="address">${escapeHtml(url || 'about:blank')}</span>
          <span class="clock">${formatDate(at)} ${formatTime(at)}</span>
        </div>
        <img src="${image}" alt="${escapeHtml(caption)}">
      </div>
    </figure>`;
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

function flattenSteps(steps: TestStep[]): TestStep[] {
  return steps.filter((s) => s.category === 'test.step').flatMap((s) => [s, ...flattenSteps(s.steps)]);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function kpi(label: string, value: string | number, cls: string): string {
  return `<div class="kpi ${cls}"><div class="value">${value}</div><div class="label">${label}</div></div>`;
}

function pct(part: number, total: number): number {
  return total ? (part / total) * 100 : 0;
}

function multiline(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function summarizeError(error: string): string {
  return (error.split(/\n\s*Call log:/)[0] ?? error).trim();
}

function readIfExists(file?: string): Buffer | undefined {
  if (!file || !fs.existsSync(file)) return undefined;
  return fs.readFileSync(file);
}

function safeUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return 'QA';
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'caso'
  );
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
  body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; color: #222; font-size: 10.5px; margin: 0; line-height: 1.35; }
  .break { page-break-before: always; }
  .muted { color: #6b7280; } .small { font-size: 9px; margin-top: 6px; }
  table { border-collapse: collapse; width: 100%; }

  /* Encabezado de documento */
  .doc-header td { border: 1px solid #8ea4c8; padding: 6px 8px; vertical-align: middle; }
  .doc-header .logo { width: 62px; text-align: center; background: #1f3864; }
  .doc-header .logo div { color: #fff; font-weight: 800; font-size: 20px; letter-spacing: .05em; }
  .doc-header .doc-title { font-size: 14px; font-weight: 700; color: #1f3864; text-align: center; letter-spacing: .03em; }
  .doc-header .doc-project { text-align: center; color: #444; font-size: 11px; }
  .doc-header .doc-code { width: 150px; font-size: 10.5px; font-weight: 700; }
  .doc-header .doc-code span { display: block; font-size: 8px; font-weight: 400; color: #6b7280; text-transform: uppercase; }

  h2 { font-size: 12px; color: #fff; background: #1f3864; padding: 4px 8px; margin: 14px 0 6px; font-weight: 600; page-break-after: avoid; }
  h2 span { opacity: .8; margin-right: 2px; }
  p.text, ul.text { margin: 4px 2px; }
  ul.text { padding-left: 18px; }

  /* Tablas de datos */
  table.grid th, table.grid td { border: 1px solid #b4c0d3; padding: 4px 7px; text-align: left; vertical-align: top; }
  table.grid th { background: #d9e2f3; width: 17%; font-weight: 600; color: #1f3864; }
  table.grid td { width: 33%; }

  table.steps th, table.steps td { border: 1px solid #b4c0d3; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.steps thead th { background: #1f3864; color: #fff; font-weight: 600; font-size: 9.5px; }
  table.steps tbody tr:nth-child(even) td { background: #f3f6fb; }
  table.steps tr { page-break-inside: avoid; }
  table.steps .n { width: 28px; text-align: center; white-space: nowrap; }
  table.steps .st { width: 64px; text-align: center; }
  .num { white-space: nowrap; text-align: right; }

  .chip { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; white-space: nowrap; }
  .chip.ok { background: #e2f0d9; color: #375623; border: 1px solid #a9d08e; }
  .chip.ko { background: #fbe2e2; color: #9c0006; border: 1px solid #f4b6b6; }
  .chip.skip { background: #ededed; color: #555; border: 1px solid #ccc; }

  /* Evidencias */
  figure { margin: 8px 0 14px; page-break-inside: avoid; }
  .fig-title { font-weight: 600; margin-bottom: 4px; color: #1f3864; }
  .fig-title > span:first-child { color: #6b7280; font-weight: 700; }
  .browser { border: 1px solid #a9b1bc; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .browser-bar { display: flex; align-items: center; gap: 8px; background: #e8eaed; padding: 5px 8px; border-bottom: 1px solid #c9ced6; }
  .dots i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 3px; background: #ff5f57; }
  .dots i:nth-child(2) { background: #febc2e; } .dots i:nth-child(3) { background: #28c840; }
  .address { flex: 1; background: #fff; border-radius: 10px; padding: 2px 10px; font-size: 8.5px; color: #3c4043; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clock { font-size: 8.5px; color: #3c4043; white-space: nowrap; }
  .browser img { display: block; width: 100%; max-height: 185mm; object-fit: contain; object-position: top; background: #fff; }

  /* Resultado */
  table.verdict { page-break-inside: avoid; }
  table.verdict td { border: 1px solid #b4c0d3; padding: 8px; vertical-align: top; }
  .stamp { width: 150px; text-align: center; vertical-align: middle !important; font-size: 16px; font-weight: 800; letter-spacing: .06em; }
  .stamp.ok { color: #375623; background: #e2f0d9; } .stamp.ko { color: #9c0006; background: #fbe2e2; } .stamp.skip { color: #555; background: #ededed; }
  .obs-title { font-weight: 700; color: #1f3864; margin-bottom: 2px; }
  pre.error { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 9px; color: #9c0006; font-family: Consolas, "DejaVu Sans Mono", monospace; }

  /* Firmas */
  table.signatures { margin-top: 26px; page-break-inside: avoid; }
  table.signatures td { width: 33%; padding: 0 14px; text-align: center; vertical-align: top; }
  .sign-line { border-top: 1px solid #333; margin: 30px 10px 4px; }
  .sign-role { font-weight: 700; color: #1f3864; }
  .sign-name { color: #555; font-size: 9.5px; text-align: left; padding-left: 10px; margin-top: 2px; }

  /* Portada */
  .kpis { display: flex; gap: 8px; margin: 8px 0; }
  .kpi { flex: 1; border: 1px solid #b4c0d3; padding: 8px; text-align: center; }
  .kpi .value { font-size: 20px; font-weight: 800; color: #1f3864; }
  .kpi .label { font-size: 8.5px; text-transform: uppercase; color: #6b7280; letter-spacing: .04em; }
  .kpi.ok .value { color: #375623; } .kpi.ko .value { color: #9c0006; } .kpi.skip .value { color: #777; }
  .bar { display: flex; height: 8px; border: 1px solid #b4c0d3; margin-bottom: 6px; }
  .bar .ok { background: #70ad47; } .bar .ko { background: #c00000; } .bar .skip { background: #bfbfbf; }
`;
