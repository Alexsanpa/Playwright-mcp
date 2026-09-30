import { test, expect } from '@fixtures/pages.fixture';
import { products } from '@data/products';
import { customer } from '@data/checkout';

test.describe('Checkout', () => {
  test('compra completa de extremo a extremo @smoke', async ({ loggedInPage, cartPage, checkoutPage }) => {
    const selected = [products.backpack, products.onesie];

    await test.step('agregar productos al carrito', async () => {
      await loggedInPage.addToCart(...selected);
      await loggedInPage.header.openCart();
      await cartPage.expectToBeOpen();
      await cartPage.expectItems(selected);
    });

    await test.step('completar datos del cliente', async () => {
      await cartPage.checkout();
      await checkoutPage.fillCustomerInfo(customer);
    });

    await test.step('validar totales', async () => {
      const subtotal = await checkoutPage.getAmount(checkoutPage.subtotalLabel);
      const tax = await checkoutPage.getAmount(checkoutPage.taxLabel);
      const total = await checkoutPage.getAmount(checkoutPage.totalLabel);
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('finalizar la orden', async () => {
      await checkoutPage.finish();
      await checkoutPage.expectOrderComplete();
      await loggedInPage.header.expectCartCount(0);
    });
  });

  test('el código postal es obligatorio @regression', async ({ loggedInPage, cartPage, checkoutPage }) => {
    await loggedInPage.addToCart(products.bikeLight);
    await loggedInPage.header.openCart();
    await cartPage.checkout();
    await checkoutPage.fillCustomerInfo({ ...customer, postalCode: '' });
    await checkoutPage.expectError('Postal Code is required');
  });
});
