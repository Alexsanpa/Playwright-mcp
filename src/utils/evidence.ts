import { test, type Page, type TestInfo } from '@playwright/test';

/** Prefijo con el que se nombran los adjuntos de evidencia (el reporte PDF lo usa para identificarlos). */
export const EVIDENCE_PREFIX = 'evidencia: ';

/**
 * Registra evidencias (capturas de pantalla con descripción) como adjuntos del test.
 * Los adjuntos quedan en el reporte HTML de Playwright y en el reporte PDF de evidencias.
 */
export class Evidence {
  private counter = 0;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {}

  /** Toma una captura de la página y la adjunta con la descripción indicada. */
  async capture(description: string, options: { fullPage?: boolean } = {}): Promise<void> {
    this.counter += 1;
    const body = await this.page.screenshot({
      fullPage: options.fullPage ?? true,
      type: 'jpeg',
      quality: 70,
    });
    await this.testInfo.attach(`${EVIDENCE_PREFIX}${String(this.counter).padStart(2, '0')} - ${description}`, {
      body,
      contentType: 'image/jpeg',
    });
  }

  /** Ejecuta un `test.step` y captura una evidencia al terminarlo (aunque el paso falle). */
  async step<T>(title: string, body: () => Promise<T>): Promise<T> {
    return test.step(title, async () => {
      try {
        return await body();
      } finally {
        await this.capture(title).catch(() => undefined);
      }
    });
  }
}
