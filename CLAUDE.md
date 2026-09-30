# Convenciones del proyecto (para agentes de IA y personas)

Proyecto de pruebas E2E con **Playwright + TypeScript** siguiendo **Page Object Model**.
Aplicación bajo prueba: https://www.saucedemo.com (atributo de test: `data-test`).

## Reglas al generar o modificar tests (incluido lo generado vía MCP)

1. **Nunca** uses `page.locator(...)`/`page.getBy...` directamente en un spec.
   Todos los locators viven como propiedades `readonly` en un Page Object de `src/pages/`
   o en un componente de `src/components/`.
2. Los specs importan `test` y `expect` desde `@fixtures/pages.fixture`, nunca desde `@playwright/test`,
   y reciben los Page Objects por fixture (`async ({ loginPage, inventoryPage }) => ...`).
   Usa `loggedInPage` cuando el test necesite empezar autenticado.
3. Prioridad de locators: `getByTestId` (`data-test`) → `getByRole` → `getByLabel`/`getByPlaceholder` → `getByText`. Evita CSS/XPath.
4. Página nueva → clase que extiende `BasePage`, define `path`, se exporta en `src/pages/index.ts`
   y se registra como fixture en `src/fixtures/pages.fixture.ts`.
5. Los datos de prueba van en `src/data/`, no hardcodeados en los specs.
6. Etiqueta cada test con `@smoke` o `@regression` en el título.
7. Los métodos de Page Object son acciones de negocio (`login`, `addToCart`) o aserciones `expect...`.
   Nada de `waitForTimeout`.
8. Cuando el MCP genere código "crudo", refactorízalo a POM antes de guardarlo en `tests/e2e/`.

## Comandos

- `npm run typecheck` — verificación de tipos
- `npm test` / `npm run test:smoke` / `npm run test:chromium`
- `npx playwright test --list` — listar tests sin ejecutarlos
