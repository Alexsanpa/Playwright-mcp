import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Clase base de la que heredan todos los Page Objects.
 * Centraliza la navegación y las utilidades comunes para que
 * las páginas concretas solo declaren sus locators y acciones de negocio.
 */
export abstract class BasePage {
  /** Ruta relativa a `baseURL` que identifica la página. */
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  async expectToBeOpen(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${escapeRegExp(this.path)}$`));
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  protected byTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
