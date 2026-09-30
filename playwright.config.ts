import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isCI = !!process.env.CI;

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
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',
    // saucedemo expone sus selectores de test con el atributo `data-test`.
    // Debe coincidir con `testIdAttribute` de playwright-mcp.config.json.
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
