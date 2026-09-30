import { test, expect } from '@fixtures/pages.fixture';
import { users } from '@data/users';

const PRECONDICIONES = ['La aplicación está disponible en el ambiente de pruebas.', 'El usuario no tiene una sesión iniciada.'];

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('usuario estándar inicia sesión correctamente @smoke', async ({ loginPage, inventoryPage, evidence }) => {
    evidence.info({
      id: 'CP-LOGIN-001',
      priority: 'Alta',
      description: 'Verificar que un usuario registrado puede iniciar sesión con credenciales válidas.',
      preconditions: [...PRECONDICIONES, 'El usuario standard_user existe y está activo.'],
    });

    await evidence.step('Ingresar a la página de inicio de sesión', async () => {
      await expect(loginPage.loginButton).toBeVisible();
    }, { expected: 'Se muestra el formulario de login con usuario, contraseña y botón "Login".' });

    await evidence.step('Ingresar credenciales válidas y presionar "Login"', async () => {
      await loginPage.loginAs(users.standard);
      await inventoryPage.expectToBeOpen();
    }, {
      data: `Usuario: ${users.standard.username}\nContraseña: ********`,
      expected: 'El sistema autentica al usuario y muestra la página "Products".',
    });
  });

  test('usuario bloqueado ve un mensaje de error @regression', async ({ loginPage, evidence }) => {
    evidence.info({
      id: 'CP-LOGIN-002',
      priority: 'Alta',
      description: 'Verificar que un usuario bloqueado no puede ingresar y recibe un mensaje claro.',
      preconditions: [...PRECONDICIONES, 'El usuario locked_out_user está bloqueado.'],
    });

    await evidence.step('Ingresar credenciales de un usuario bloqueado y presionar "Login"', async () => {
      await loginPage.loginAs(users.lockedOut);
      await loginPage.expectError('Sorry, this user has been locked out.');
    }, {
      data: `Usuario: ${users.lockedOut.username}\nContraseña: ********`,
      expected: 'Se muestra el mensaje "Sorry, this user has been locked out." y no se permite el ingreso.',
    });
  });

  test('credenciales inválidas muestran un error @regression', async ({ loginPage, evidence }) => {
    evidence.info({
      id: 'CP-LOGIN-003',
      priority: 'Media',
      description: 'Verificar el mensaje de error al ingresar un usuario o contraseña incorrectos.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Ingresar credenciales inválidas y presionar "Login"', async () => {
      await loginPage.loginAs(users.invalid);
      await loginPage.expectError('Username and password do not match');
    }, {
      data: `Usuario: ${users.invalid.username}\nContraseña: ********`,
      expected: 'Se muestra el mensaje "Username and password do not match any user in this service".',
    });
  });

  test('campos obligatorios vacíos @regression', async ({ loginPage, evidence }) => {
    evidence.info({
      id: 'CP-LOGIN-004',
      priority: 'Baja',
      description: 'Verificar la validación de campos obligatorios en el formulario de login.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Presionar "Login" sin diligenciar usuario ni contraseña', async () => {
      await loginPage.loginButton.click();
      await loginPage.expectError('Username is required');
    }, { data: 'Campos vacíos', expected: 'Se muestra el mensaje "Username is required".' });
  });

  test('cerrar sesión regresa al login @regression', async ({ loggedInPage, loginPage, evidence }) => {
    evidence.info({
      id: 'CP-LOGIN-005',
      priority: 'Media',
      description: 'Verificar que el usuario puede cerrar sesión desde el menú lateral.',
      preconditions: ['El usuario standard_user tiene una sesión iniciada.'],
    });

    await evidence.capture('Verificar que el usuario se encuentra autenticado', {
      expected: 'Se muestra la página "Products".',
    });

    await evidence.step('Abrir el menú lateral y seleccionar "Logout"', async () => {
      await loggedInPage.header.logout();
      await expect(loginPage.loginButton).toBeVisible();
    }, { expected: 'La sesión se cierra y se muestra nuevamente el formulario de login.' });
  });
});
