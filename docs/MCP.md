# Integración con Playwright MCP

El proyecto incluye dos servidores MCP, ya configurados para Claude Code (`.mcp.json`),
VS Code / GitHub Copilot (`.vscode/mcp.json`) y Cursor (`.cursor/mcp.json`):

| Servidor | Paquete | Para qué sirve |
|---|---|---|
| `playwright` | `@playwright/mcp` | Controla un navegador real: navegar, hacer clic, leer el árbol de accesibilidad, capturas. Ideal para **explorar** la app y descubrir locators. Usa `playwright-mcp.config.json`. |
| `playwright-test` | `playwright run-test-mcp-server` (incluido en `@playwright/test`) | Lo usan los **agentes de test** (planner, generator, healer) de `.claude/agents/` para planificar, generar y reparar specs usando `tests/seed.spec.ts` como punto de partida. |

## Configuración (`playwright-mcp.config.json`)

- Chromium visible (`headless: false`), perfil aislado en memoria.
- `testIdAttribute: "data-test"` — igual que `playwright.config.ts`, así el código que sugiere el MCP usa `getByTestId` compatible con los Page Objects.
- `capabilities: ["vision"]` — habilita herramientas por coordenadas y capturas.
- Salidas (capturas, trazas) en `.playwright-mcp/` (ignorado por git).

Para ejecutarlo a mano (p. ej. para clientes que se conectan por HTTP):

```bash
npm run mcp                                  # stdio con la config del proyecto
npx @playwright/mcp --config playwright-mcp.config.json --port 8931   # HTTP en :8931
```

## Agentes de Playwright (Claude Code)

Generados con `npx playwright init-agents --loop claude --project chromium`:

- **playwright-test-planner** — explora la app y escribe un plan en `specs/*.md`.
- **playwright-test-generator** — convierte cada escenario del plan en un spec.
- **playwright-test-healer** — ejecuta los tests fallidos y los repara.

Para VS Code/Copilot: `npx playwright init-agents --loop vscode`.
Tras actualizar `@playwright/test`, vuelve a ejecutar `init-agents` para regenerar los agentes
(revisa que `.mcp.json` conserve también el servidor `playwright`).

## Prompts de ejemplo

**Explorar y crear un Page Object nuevo**
```
Con el MCP de playwright, inicia sesión en saucedemo con standard_user y abre el detalle
de un producto. Crea src/pages/ProductDetailPage.ts siguiendo CLAUDE.md (extiende BasePage,
locators con getByTestId), regístralo en la fixture y escribe tests/e2e/product-detail.spec.ts.
```

**Plan → tests**
```
Usa playwright-test-planner para planificar pruebas del ordenamiento del inventario
y guárdalo en specs/ordenamiento.md. Después usa playwright-test-generator para
generar los tests y refactorízalos a POM según CLAUDE.md.
```

**Reparar**
```
Usa playwright-test-healer para arreglar los tests fallidos de tests/e2e/checkout.spec.ts
manteniendo los locators dentro de los Page Objects.
```
