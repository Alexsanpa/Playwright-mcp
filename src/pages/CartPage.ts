import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { HeaderComponent } from '../components/HeaderComponent';

export class CartPage extends BasePage {
  protected readonly path = '/cart.html';

  readonly header: HeaderComponent;
  readonly items: Locator;
  readonly itemNames: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingButton: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.items = this.byTestId('inventory-item');
    this.itemNames = this.byTestId('inventory-item-name');
    this.checkoutButton = this.byTestId('checkout');
    this.continueShoppingButton = this.byTestId('continue-shopping');
  }

  async expectItems(names: string[]): Promise<void> {
    await expect(this.itemNames).toHaveText(names);
  }

  async remove(name: string): Promise<void> {
    await this.items
      .filter({ hasText: name })
      .getByRole('button', { name: 'Remove' })
      .click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
