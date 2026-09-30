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

Cada ejecución genera documentos de evidencia con formato de **plantilla de ejecución de QA**
(como los que se diligencian en una prueba manual):

```
evidence-report/
└── 20260930-153000/
    ├── reporte-evidencias.pdf        # informe consolidado
    └── casos/                        # un documento de evidencia por caso
        ├── cp-login-001-usuario-estandar-inicia-sesion-correctamente-chromium.pdf
        ├── cp-chk-001-compra-completa-de-extremo-a-extremo-chromium.pdf
        └── ...
```

**Documento por caso**

1. Encabezado del documento (código del caso, proyecto, ambiente).
2. Información general: ID, nombre, prioridad, módulo, requisito/HU, ejecutado por, fecha,
   hora de inicio y fin, ambiente/URL, navegador y resolución, versión/build.
3. Objetivo del caso y precondiciones.
4. Tabla de pasos: **acción · datos de prueba · resultado esperado · resultado obtenido · estado**.
5. Evidencias: un pantallazo por paso, enmarcado como ventana de navegador con la **URL y la hora** de la captura.
6. Resultado (APROBADO / FALLIDO) con observaciones (detalle del error si falló).
7. Bloque de firmas: ejecutado por, revisado por, aprobado por.

**Informe consolidado:** portada con datos de la ejecución, indicadores, tabla de todos los casos,
firmas y, a continuación, el documento de cada caso.

### Cómo documentar un caso

```ts
test('compra completa @smoke', async ({ loggedInPage, cartPage, evidence }) => {
  evidence.info({
    id: 'CP-CHK-001',
    priority: 'Alta',
    requirement: 'HU-12',                       // opcional
    description: 'Verificar que un usuario puede completar una compra.',
    preconditions: ['Sesión iniciada con standard_user.', 'Carrito vacío.'],
  });

  // Ejecuta el paso y toma el pantallazo al terminar (también si falla)
  await evidence.step('Agregar productos y abrir el carrito', async () => {
    await loggedInPage.addToCart(products.backpack);
    await loggedInPage.header.openCart();
  }, {
    data: products.backpack,
    expected: 'El carrito muestra el producto seleccionado.',
  });

  // Punto de verificación con pantallazo, sin acciones
  await evidence.capture('Verificar el total', { expected: 'El total incluye impuestos.' });
});
```

Si un caso no usa `evidence`, igual se documenta: sus `test.step` forman la tabla de pasos y
`screenshot: 'on'` aporta el pantallazo del estado final.

### Configuración

- Variables de entorno (ver `.env.example`): `TESTER` (ejecutado por), `TEST_ENV` (ambiente), `APP_VERSION` (versión/build).
- Opciones del reporter en `playwright.config.ts`: `title`, `project`, `environment`, `executedBy`,
  `appVersion`, `consolidated`, `perTest`, `signatures`, `includeAutoScreenshots`, `exclude`, `keepHtml`, `outputDir`, `fileName`.
- Desactivarlo en una ejecución: `PDF_REPORT=false npx playwright test`
  (PowerShell: `$env:PDF_REPORT='false'; npx playwright test`).
- Con varios navegadores se genera un documento por caso y navegador; para un único juego usa `npm run test:chromium`.

> Los PDF se generan con el Chromium de Playwright (`npx playwright install chromium`).

## Playwright MCP

Al abrir el proyecto en Claude Code, VS Code o Cursor, los servidores MCP `playwright`
y `playwright-test` se detectan automáticamente (acepta la confirmación la primera vez).
Detalles, configuración y prompts de ejemplo en [docs/MCP.md](docs/MCP.md).

## CI

`.github/workflows/playwright.yml` ejecuta typecheck y los tests en Chromium en cada push/PR
y publica como artefactos el reporte HTML y el PDF de evidencias.
