import { test, type Browser, type Page, type TestInfo } from '@playwright/test';

/** Prefijo con el que se nombran las capturas de evidencia. */
export const EVIDENCE_PREFIX = 'evidencia: ';
/** Nombre del adjunto JSON con los datos de cada paso (lo consume el reporte PDF). */
export const STEP_ATTACHMENT = 'evidencia-paso';
/** Prefijo de las anotaciones con los datos del caso (ID, descripción, precondiciones...). */
export const CASE_ANNOTATION_PREFIX = 'caso:';

export interface CaseInfo {
  /** Identificador del caso, p. ej. `CP-LOGIN-001`. */
  id?: string;
  /** Objetivo o descripción del caso. */
  description?: string;
  /** Precondiciones necesarias para ejecutar el caso. */
  preconditions?: string | string[];
  /** Prioridad: Alta, Media, Baja... */
  priority?: string;
  /** Módulo o funcionalidad. Por defecto se usa el `describe`. */
  module?: string;
  /** Historia de usuario / requisito asociado. */
  requirement?: string;
}

export interface StepDetails {
  /** Datos de prueba utilizados en el paso. */
  data?: string;
  /** Resultado esperado del paso. */
  expected?: string;
  /** Resultado obtenido cuando el paso es exitoso. Por defecto: "Resultado conforme a lo esperado." */
  actual?: string;
}

export interface StepRecordData extends StepDetails {
  index: number;
  action: string;
  status: 'passed' | 'failed';
  url: string;
  timestamp: string;
  screenshot?: string;
}

/**
 * Registra la evidencia de ejecución de un caso: datos del caso, pasos con resultado
 * esperado/obtenido y un pantallazo por paso. El reporter PDF lo convierte en un
 * documento de evidencia con formato de ejecución de pruebas.
 */
export class Evidence {
  private counter = 0;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {}

  /** Datos de cabecera del caso de prueba. */
  info(info: CaseInfo): void {
    for (const [key, value] of Object.entries(info)) {
      if (value === undefined) continue;
      this.testInfo.annotations.push({
        type: `${CASE_ANNOTATION_PREFIX}${key}`,
        description: Array.isArray(value) ? value.join('\n') : String(value),
      });
    }
  }

  /**
   * Ejecuta un paso del caso y registra su evidencia (pantallazo + resultado),
   * tanto si el paso es exitoso como si falla.
   */
  async step<T>(action: string, body: () => Promise<T>, details: StepDetails = {}): Promise<T> {
    return test.step(action, async () => {
      try {
        const value = await body();
        await this.record(action, details, 'passed');
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.record(action, { ...details, actual: summarizeError(message) }, 'failed').catch(() => undefined);
        throw error;
      }
    });
  }

  /** Registra un punto de verificación con pantallazo (sin ejecutar acciones). */
  async capture(action: string, details: StepDetails = {}): Promise<void> {
    await this.record(action, details, 'passed');
  }

  private async record(action: string, details: StepDetails, status: StepRecordData['status']): Promise<void> {
    this.counter += 1;
    const index = this.counter;
    const screenshot = `${EVIDENCE_PREFIX}${String(index).padStart(2, '0')} - ${action}`;

    const body = await this.page
      .screenshot({ fullPage: true, type: 'jpeg', quality: 75 })
      .catch(() => undefined);
    if (body) await this.testInfo.attach(screenshot, { body, contentType: 'image/jpeg' });

    const step: StepRecordData = {
      index,
      action,
      ...details,
      actual: details.actual ?? (status === 'passed' ? 'Resultado conforme a lo esperado.' : undefined),
      status,
      url: this.page.url(),
      timestamp: new Date().toISOString(),
      screenshot: body ? screenshot : undefined,
    };
    await this.testInfo.attach(STEP_ATTACHMENT, {
      body: Buffer.from(JSON.stringify(step)),
      contentType: 'application/json',
    });
  }
}

/** Anota en el caso el navegador y la resolución con los que se ejecutó. */
export function annotateEnvironment(testInfo: TestInfo, browser: Browser, page: Page): void {
  const viewport = page.viewportSize();
  testInfo.annotations.push({
    type: `${CASE_ANNOTATION_PREFIX}browser`,
    description: `${browser.browserType().name()} ${browser.version()}${viewport ? ` · ${viewport.width}x${viewport.height}` : ''}`,
  });
}

/** Resume un error de Playwright en pocas líneas legibles (sin el call log). */
function summarizeError(message: string): string {
  const clean = message.replace(/\u001b\[[0-9;]*m/g, '').split(/\n\s*Call log:/)[0] ?? message;
  return clean
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n');
}
