import { test, expect } from '@fixtures/pages.fixture';

/**
 * Seed para los agentes de Playwright (planner / generator / healer).
 * Deja el navegador autenticado en el inventario usando los Page Objects,
 * de modo que los agentes exploran la app a partir de un estado conocido.
 */
test.describe('Seed', () => {
  test('seed', async ({ loggedInPage }) => {
    await expect(loggedInPage.items.first()).toBeVisible();
  });
});
