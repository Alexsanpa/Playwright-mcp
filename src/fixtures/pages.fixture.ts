import { test as base, expect } from '@playwright/test';
import { CartPage, CheckoutPage, InventoryPage, LoginPage } from '../pages';
import { users } from '../data/users';
import { annotateEnvironment, CASE_ANNOTATION_PREFIX, Evidence } from '../utils/evidence';

type Pages = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
};

type Session = {
  /** Registro de evidencias (capturas) que se incluyen en el reporte PDF. */
  evidence: Evidence;
  /** Página de inventario con el usuario estándar ya autenticado. */
  loggedInPage: InventoryPage;
};

/**
 * Fixtures que inyectan los Page Objects en cada test.
 * Así los specs no instancian páginas manualmente: `test('...', async ({ loginPage }) => ...)`.
 */
export const test = base.extend<Pages & Session>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  inventoryPage: async ({ page }, use) => use(new InventoryPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),

  // `auto`: todos los casos registran navegador/resolución para el documento de evidencia.
  evidence: [
    async ({ page, browser }, use, testInfo) => {
      annotateEnvironment(testInfo, browser, page);
      await use(new Evidence(page, testInfo));
      testInfo.annotations.push({ type: `${CASE_ANNOTATION_PREFIX}finalUrl`, description: page.url() });
    },
    { auto: true },
  ],

  loggedInPage: async ({ loginPage, inventoryPage }, use) => {
    await loginPage.goto();
    await loginPage.loginAs(users.standard);
    await inventoryPage.expectToBeOpen();
    await use(inventoryPage);
  },
});

export { expect };
