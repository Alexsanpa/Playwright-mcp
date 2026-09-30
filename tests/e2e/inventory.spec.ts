import { test, expect } from '@fixtures/pages.fixture';
import { products } from '@data/products';
import { sortAsc, sortDesc } from '@utils/sorting';

const PRECONDICIONES = ['El usuario standard_user tiene una sesión iniciada.', 'El carrito de compras está vacío.'];

test.describe('Inventario', () => {
  test('muestra el catálogo de productos @smoke', async ({ loggedInPage, evidence }) => {
    evidence.info({
      id: 'CP-INV-001',
      priority: 'Alta',
      description: 'Verificar que el catálogo muestra todos los productos disponibles.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Visualizar el listado de productos', async () => {
      await expect(loggedInPage.items).toHaveCount(6);
    }, { expected: 'Se listan 6 productos con nombre, descripción, precio y botón "Add to cart".' });
  });

  test('ordena por nombre Z-A @regression', async ({ loggedInPage, evidence }) => {
    evidence.info({
      id: 'CP-INV-002',
      priority: 'Media',
      description: 'Verificar el ordenamiento de productos por nombre en orden descendente.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Seleccionar el orden "Name (Z to A)"', async () => {
      await loggedInPage.sortBy('za');
      const names = await loggedInPage.getNames();
      expect(names).toEqual(sortDesc(names));
    }, { data: 'Orden: Name (Z to A)', expected: 'Los productos se muestran ordenados alfabéticamente de la Z a la A.' });
  });

  test('ordena por precio de menor a mayor @regression', async ({ loggedInPage, evidence }) => {
    evidence.info({
      id: 'CP-INV-003',
      priority: 'Media',
      description: 'Verificar el ordenamiento de productos por precio ascendente.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Seleccionar el orden "Price (low to high)"', async () => {
      await loggedInPage.sortBy('lohi');
      const prices = await loggedInPage.getPrices();
      expect(prices).toEqual(sortAsc(prices));
    }, { data: 'Orden: Price (low to high)', expected: 'Los productos se muestran del menor al mayor precio.' });
  });

  test('agrega y quita productos del carrito @smoke', async ({ loggedInPage, evidence }) => {
    evidence.info({
      id: 'CP-INV-004',
      priority: 'Alta',
      description: 'Verificar que se pueden agregar y quitar productos del carrito desde el catálogo.',
      preconditions: PRECONDICIONES,
    });

    await evidence.step('Agregar dos productos al carrito', async () => {
      await loggedInPage.addToCart(products.backpack, products.bikeLight);
      await loggedInPage.header.expectCartCount(2);
    }, {
      data: `${products.backpack}\n${products.bikeLight}`,
      expected: 'El contador del carrito muestra 2 y los botones cambian a "Remove".',
    });

    await evidence.step('Quitar un producto del carrito', async () => {
      await loggedInPage.removeFromCart(products.backpack);
      await loggedInPage.header.expectCartCount(1);
    }, { data: products.backpack, expected: 'El contador del carrito muestra 1.' });
  });
});
