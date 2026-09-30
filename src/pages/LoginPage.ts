import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import type { User } from '../data/users';

export class LoginPage extends BasePage {
  protected readonly path = '/';

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = this.byTestId('username');
    this.passwordInput = this.byTestId('password');
    this.loginButton = this.byTestId('login-button');
    this.errorMessage = this.byTestId('error');
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginAs(user: User): Promise<void> {
    await this.login(user.username, user.password);
  }

  async expectError(message: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }
}
