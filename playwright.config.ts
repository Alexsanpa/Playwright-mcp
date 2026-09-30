import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isCI = !!process.env.CI;
// Reporte PDF de evidencias: activo por defecto, se desactiva con PDF_REPORT=false.
const pdfReport = process.env.PDF_REPORT !== 'false';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ...(pdfReport
      ? [
          [
            './src/reporters/pdf-evidence-reporter.ts',
            {
              title: 'Reporte de evidencias de pruebas',
              project: 'Sauce Demo · Playwright + POM',
              outputDir: 'evidence-report',
              consolidated: true, // reporte-evidencias.pdf con todos los casos
              perTest: true, // casos/NN-<caso>-<navegador>.pdf, uno por caso
            },
          ] as const,
        ]
      : []),
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',
    // saucedemo expone sus selectores de test con el atributo `data-test`.
    // Debe coincidir con `testIdAttribute` de playwright-mcp.config.json.
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    // Captura final de cada caso: queda como evidencia en los PDF aunque el test no use `evidence`.
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
