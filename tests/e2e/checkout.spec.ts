import { test, expect } from '@fixtures/pages.fixture';
import { products } from '@data/products';
import { customer } from '@data/checkout';

test.describe('Checkout', () => {
  test('compra completa de extremo a extremo @smoke', async ({ loggedInPage, cartPage, checkoutPage, evidence }) => {
    const selected = [products.backpack, products.onesie];
    evidence.info({
      id: 'CP-CHK-001',
      priority: 'Alta',
      description: 'Verificar que un usuario puede completar una compra de principio a fin.',
      preconditions: ['El usuario standard_user tiene una sesión iniciada.', 'El carrito de compras está vacío.'],
    });

    await evidence.step('Agregar productos al carrito y abrir el carrito', async () => {
      await loggedInPage.addToCart(...selected);
      await loggedInPage.header.openCart();
      await cartPage.expectToBeOpen();
      await cartPage.expectItems(selected);
    }, { data: selected.join('\n'), expected: 'El carrito muestra los productos seleccionados.' });

    await evidence.step('Presionar "Checkout" y diligenciar los datos del cliente', async () => {
      await cartPage.checkout();
      await checkoutPage.fillCustomerInfo(customer);
    }, {
      data: `Nombre: ${customer.firstName}\nApellido: ${customer.lastName}\nCódigo postal: ${customer.postalCode}`,
      expected: 'Se muestra el resumen de la orden (Checkout: Overview).',
    });

    await evidence.step('Validar los totales de la orden', async () => {
      const subtotal = await checkoutPage.getAmount(checkoutPage.subtotalLabel);
      const tax = await checkoutPage.getAmount(checkoutPage.taxLabel);
      const total = await checkoutPage.getAmount(checkoutPage.totalLabel);
      expect(total).toBeCloseTo(subtotal + tax, 2);
    }, { expected: 'El total es igual al subtotal más impuestos.' });

    await evidence.step('Presionar "Finish"', async () => {
      await checkoutPage.finish();
      await checkoutPage.expectOrderComplete();
      await loggedInPage.header.expectCartCount(0);
    }, { expected: 'Se muestra "Thank you for your order!" y el carrito queda vacío.' });
  });

  test('el código postal es obligatorio @regression', async ({ loggedInPage, cartPage, checkoutPage, evidence }) => {
    evidence.info({
      id: 'CP-CHK-002',
      priority: 'Media',
      description: 'Verificar la validación del campo obligatorio "Zip/Postal Code" en el checkout.',
      preconditions: ['El usuario standard_user tiene una sesión iniciada.'],
    });

    await evidence.step('Agregar un producto e iniciar el checkout', async () => {
      await loggedInPage.addToCart(products.bikeLight);
      await loggedInPage.header.openCart();
      await cartPage.checkout();
    }, { data: products.bikeLight, expected: 'Se muestra el formulario "Checkout: Your Information".' });

    await evidence.step('Diligenciar nombre y apellido sin código postal y presionar "Continue"', async () => {
      await checkoutPage.fillCustomerInfo({ ...customer, postalCode: '' });
      await checkoutPage.expectError('Postal Code is required');
    }, {
      data: `Nombre: ${customer.firstName}\nApellido: ${customer.lastName}\nCódigo postal: (vacío)`,
      expected: 'Se muestra el mensaje "Error: Postal Code is required".',
    });
  });
});
