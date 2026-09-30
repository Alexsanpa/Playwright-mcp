import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import type { CustomerInfo } from '../data/checkout';

/**
 * El checkout de saucedemo tiene tres pasos (información, resumen y confirmación).
 * Se modela como un único Page Object porque comparten flujo y son pantallas cortas.
 */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout-step-one.html';

  // Paso 1: información del cliente
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly errorMessage: Locator;

  // Paso 2: resumen
  readonly subtotalLabel: Locator;
  readonly taxLabel: Locator;
  readonly totalLabel: Locator;
  readonly finishButton: Locator;

  // Paso 3: confirmación
  readonly completeHeader: Locator;
  readonly backHomeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.firstNameInput = this.byTestId('firstName');
    this.lastNameInput = this.byTestId('lastName');
    this.postalCodeInput = this.byTestId('postalCode');
    this.continueButton = this.byTestId('continue');
    this.errorMessage = this.byTestId('error');

    this.subtotalLabel = this.byTestId('subtotal-label');
    this.taxLabel = this.byTestId('tax-label');
    this.totalLabel = this.byTestId('total-label');
    this.finishButton = this.byTestId('finish');

    this.completeHeader = this.byTestId('complete-header');
    this.backHomeButton = this.byTestId('back-to-products');
  }

  async fillCustomerInfo(info: CustomerInfo): Promise<void> {
    await this.firstNameInput.fill(info.firstName);
    await this.lastNameInput.fill(info.lastName);
    await this.postalCodeInput.fill(info.postalCode);
    await this.continueButton.click();
  }

  async getAmount(label: Locator): Promise<number> {
    const text = await label.innerText();
    const match = text.match(/\$([\d.]+)/);
    if (!match) throw new Error(`No se encontró un importe en: "${text}"`);
    return Number(match[1]);
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  async expectOrderComplete(): Promise<void> {
    await expect(this.page).toHaveURL(/checkout-complete\.html$/);
    await expect(this.completeHeader).toHaveText('Thank you for your order!');
  }

  async expectError(message: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
  }
}
