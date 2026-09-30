# Playwright + TypeScript · POM · MCP

Framework de automatización E2E con **Playwright** y **TypeScript**, organizado con
**Page Object Model (POM)** e integrado con **Playwright MCP** para que un asistente de IA
(Claude Code, GitHub Copilot, Cursor…) pueda explorar la aplicación en un navegador real y
generar, planificar y reparar tests.

Aplicación de ejemplo: [saucedemo.com](https://www.saucedemo.com).

## Requisitos

- Node.js 18+ (recomendado LTS)

## Instalación

```bash
npm install
npx playwright install --with-deps   # navegadores
cp .env.example .env                  # opcional: personalizar URL / credenciales
```

## Estructura

```
├── src/
│   ├── pages/            # Page Objects (una clase por página)
│   │   ├── BasePage.ts   # clase base: navegación y utilidades comunes
│   │   ├── LoginPage.ts
│   │   ├── InventoryPage.ts
│   │   ├── CartPage.ts
│   │   ├── CheckoutPage.ts
│   │   └── index.ts
│   ├── components/       # fragmentos reutilizables (HeaderComponent)
│   ├── fixtures/         # fixtures que inyectan los Page Objects en los tests
│   ├── data/             # datos de prueba (usuarios, productos, clientes)
│   ├── reporters/        # reporter PDF de evidencias
│   └── utils/            # utilidades (evidence.ts: captura de evidencias)
├── tests/
│   ├── e2e/              # specs (login, inventario, checkout)
│   └── seed.spec.ts      # estado inicial para los agentes de Playwright
├── specs/                # planes de prueba generados por el agente planner
├── .claude/agents/       # agentes planner / generator / healer
├── .mcp.json             # MCP para Claude Code
├── .vscode/mcp.json      # MCP para VS Code / Copilot
├── .cursor/mcp.json      # MCP para Cursor
├── playwright-mcp.config.json
├── playwright.config.ts
└── CLAUDE.md             # convenciones POM que deben seguir los agentes
```

## Cómo se escribe un test

Los Page Objects se reciben como fixtures; el spec solo describe el flujo de negocio:

```ts
import { test } from '@fixtures/pages.fixture';
import { products } from '@data/products';

test('agrega productos al carrito @smoke', async ({ loggedInPage }) => {
  await loggedInPage.addToCart(products.backpack, products.bikeLight);
  await loggedInPage.header.expectCartCount(2);
});
```

Alias de importación disponibles: `@pages/*`, `@components/*`, `@fixtures/*`, `@data/*`, `@utils/*`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm test` | Todos los tests en todos los navegadores |
| `npm run test:chromium` | Solo Chromium |
| `npm run test:smoke` | Tests etiquetados `@smoke` |
| `npm run test:regression` | Tests etiquetados `@regression` |
| `npm run test:headed` / `test:ui` / `test:debug` | Modos visual, UI y depuración |
| `npm run report` | Abre el reporte HTML |
| `npm run typecheck` | Verificación de tipos |
| `npm run codegen` | Grabador de Playwright |
| `npm run mcp` | Levanta el servidor Playwright MCP con la config del proyecto |

## Reporte PDF de evidencias

Cada ejecución genera un PDF en `evidence-report/reporte-evidencias-<fecha>.pdf` con:

- **Portada:** fecha, duración, resultado global, entorno, indicadores (total, exitosos, fallidos, inestables, omitidos, % de éxito) y tabla resumen.
- **Una sección por caso:** suite, archivo, proyecto/navegador, estado, duración, etiquetas, pasos (✓/✗), mensaje de error y **capturas de evidencia** con su descripción.
- Las capturas automáticas de Playwright (en fallos) y las rutas de video/trace.

Las evidencias se registran desde los tests con el fixture `evidence`:

```ts
test('compra completa @smoke', async ({ loggedInPage, cartPage, evidence }) => {
  // Ejecuta el paso y captura la pantalla al terminar (aunque falle)
  await evidence.step('agregar productos al carrito', async () => {
    await loggedInPage.addToCart(products.backpack);
    await loggedInPage.header.openCart();
  });

  // Captura puntual con descripción
  await evidence.capture('carrito con productos');
});
```

Opciones del reporter en `playwright.config.ts` (`title`, `project`, `outputDir`, `fileName`,
`includeAutoScreenshots`, `keepHtml`, `launchOptions`). Para desactivarlo en una ejecución:
`PDF_REPORT=false npx playwright test` (en PowerShell: `$env:PDF_REPORT='false'; npx playwright test`).

> El PDF se genera con el Chromium de Playwright, así que debe estar instalado
> (`npx playwright install chromium`) aunque ejecutes los tests solo en Firefox o WebKit.

## Playwright MCP

Al abrir el proyecto en Claude Code, VS Code o Cursor, los servidores MCP `playwright`
y `playwright-test` se detectan automáticamente (acepta la confirmación la primera vez).
Detalles, configuración y prompts de ejemplo en [docs/MCP.md](docs/MCP.md).

## CI

`.github/workflows/playwright.yml` ejecuta typecheck y los tests en Chromium en cada push/PR
y publica como artefactos el reporte HTML y el PDF de evidencias.
