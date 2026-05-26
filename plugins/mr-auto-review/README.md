# MR-auto-review (Claude Code plugin)

Multi-agent reviewer for Wetaca GitLab Merge Requests. Sustituye al skill `omar-review` con sandbox real, integración con GitLab API + Atlassian MCP (Jira), KB empírico y personas con voz propia para cada reviewer agent.

> **Status**: en desarrollo. Wave 0 (KB empírico) completa. Wave 1 (esqueleto + MVP local) en curso.

## Componentes

- **Manifest**: `.claude-plugin/plugin.json` (entry point del plugin)
- **Agents**: `agents/<name>.md` — 22 reviewers, cada uno con persona + system prompt + toolset restringido
- **Slash command**: `commands/mr-review.md` — orquesta el flujo completo `/mr-review [--local|--mr <iid>]`
- **MCP server**: `mcp-server/` — expone `mr_write`, `mr_read`, `mr_list`, `mr_overwrite`, `mr_signal` + wrappers GitLab
- **KB**: `_kb/<concern>.md` — checklists destiladas del análisis empírico de MRs históricas
- **Scripts library**: pre-auditados, reutilizables (`scripts/library/`)
- **Hooks**: `hooks/hooks.json` — capa final de defensa por path/tool

## Modos de uso

```bash
/mr-review                # detecta automático: branch con MR remota → modo remoto; sin MR → modo local
/mr-review --local        # fuerza modo local (output a fichero, sin postear)
/mr-review --mr 3762      # revisa MR concreta por IID
/mr-review --resume       # continúa una review interrumpida
/mr-review --status       # muestra estado del workspace activo
```

## Instalación

El plugin se distribuye vía el marketplace [`mkt-test`](https://github.com/vicente-wetaca/mkt-test).

Desde Claude Code:

```
/plugin marketplace add vicente-wetaca/mkt-test
/plugin install mr-auto-review@mkt-test
```

Reinicia Claude Code o ejecuta `/reload-plugins`. Verifica con `/help` (aparece `/mr-review`) y que los agent types `R-*` están registrados.

### Actualizar

```
/plugin marketplace update mkt-test
```

### Desinstalar

```
/plugin uninstall mr-auto-review@mkt-test
```

### MCP server

El servidor MCP del plugin se distribuye **bundleado** (`mcp-server/dist/index.js` es self-contained vía `esbuild`). Los usuarios no necesitan `npm install` ni build — Claude Code lo arranca on-demand cuando se invoca una tool `mcp__plugin_mr-auto-review_mr-auto-review__*`.

Para regenerar el bundle al modificar el server (sólo desarrollo):

```
cd mcp-server && npm install && npm run bundle
```

### Variables de entorno

El servidor MCP necesita un `GITLAB_TOKEN` para postear comentarios. Ver `mcp-server/.env.example` para la plantilla. Se carga via `.env` en `${CLAUDE_PLUGIN_ROOT}/mcp-server/` (no se commitea).

## Estructura

Ver `docs/ARCHITECTURE.md` para el flujo completo y `docs/AGENT-CATALOG.md` para el roster de los 22 agents.
