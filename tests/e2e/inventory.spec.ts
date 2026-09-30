import { test, expect } from '@fixtures/pages.fixture';
import { products } from '@data/products';
import { sortAsc, sortDesc } from '@utils/sorting';

test.describe('Inventario', () => {
  test('muestra el catálogo de productos @smoke', async ({ loggedInPage }) => {
    await expect(loggedInPage.items).toHaveCount(6);
  });

  test('ordena por nombre Z-A @regression', async ({ loggedInPage }) => {
    await loggedInPage.sortBy('za');
    const names = await loggedInPage.getNames();
    expect(names).toEqual(sortDesc(names));
  });

  test('ordena por precio de menor a mayor @regression', async ({ loggedInPage }) => {
    await loggedInPage.sortBy('lohi');
    const prices = await loggedInPage.getPrices();
    expect(prices).toEqual(sortAsc(prices));
  });

  test('agrega y quita productos del carrito @smoke', async ({ loggedInPage }) => {
    await loggedInPage.addToCart(products.backpack, products.bikeLight);
    await loggedInPage.header.expectCartCount(2);

    await loggedInPage.removeFromCart(products.backpack);
    await loggedInPage.header.expectCartCount(1);
  });
});
