import { test, expect } from '@fixtures/pages.fixture';
import { users } from '@data/users';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('usuario estándar inicia sesión correctamente @smoke', async ({ loginPage, inventoryPage }) => {
    await loginPage.loginAs(users.standard);
    await inventoryPage.expectToBeOpen();
  });

  test('usuario bloqueado ve un mensaje de error @regression', async ({ loginPage }) => {
    await loginPage.loginAs(users.lockedOut);
    await loginPage.expectError('Sorry, this user has been locked out.');
  });

  test('credenciales inválidas muestran un error @regression', async ({ loginPage }) => {
    await loginPage.loginAs(users.invalid);
    await loginPage.expectError('Username and password do not match');
  });

  test('campos obligatorios vacíos @regression', async ({ loginPage }) => {
    await loginPage.loginButton.click();
    await loginPage.expectError('Username is required');
  });

  test('cerrar sesión regresa al login @regression', async ({ loggedInPage, loginPage }) => {
    await loggedInPage.header.logout();
    await expect(loginPage.loginButton).toBeVisible();
  });
});
