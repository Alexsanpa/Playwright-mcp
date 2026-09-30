import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { HeaderComponent } from '../components/HeaderComponent';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage extends BasePage {
  protected readonly path = '/inventory.html';

  readonly header: HeaderComponent;
  readonly items: Locator;
  readonly itemNames: Locator;
  readonly itemPrices: Locator;
  readonly sortSelect: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.items = this.byTestId('inventory-item');
    this.itemNames = this.byTestId('inventory-item-name');
    this.itemPrices = this.byTestId('inventory-item-price');
    this.sortSelect = this.byTestId('product-sort-container');
  }

  override async expectToBeOpen(): Promise<void> {
    await super.expectToBeOpen();
    await expect(this.header.pageTitle).toHaveText('Products');
  }

  /** Devuelve la tarjeta de un producto a partir de su nombre visible. */
  item(name: string): Locator {
    return this.items.filter({ has: this.byTestId('inventory-item-name').getByText(name, { exact: true }) });
  }

  async addToCart(...names: string[]): Promise<void> {
    for (const name of names) {
      await this.item(name).getByRole('button', { name: 'Add to cart' }).click();
    }
  }

  async removeFromCart(name: string): Promise<void> {
    await this.item(name).getByRole('button', { name: 'Remove' }).click();
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortSelect.selectOption(option);
  }

  async getNames(): Promise<string[]> {
    return this.itemNames.allInnerTexts();
  }

  async getPrices(): Promise<number[]> {
    const prices = await this.itemPrices.allInnerTexts();
    return prices.map((p) => Number(p.replace('$', '')));
  }
}
