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

El plugin se distribuye vía marketplace local declarado en el propio repo. El `marketplace.json` vive en `<repo-root>/.claude-plugin/marketplace.json` (committed).

### Para devs Wetaca (después de clonar el repo)

Desde Claude Code, en cualquier directorio (mejor desde la raíz del repo):

```
/plugin marketplace add /Users/<tu-user>/Projects/.../wetaca.com
/plugin install mr-auto-review@wetaca-plugins
```

Luego reinicia Claude Code o ejecuta `/reload-plugins`. Verifica con `/help` (aparece `/mr-review`) y que los 4 agent types están registrados.

### Actualizar tras pull

```
/plugin marketplace update wetaca-plugins
```

### Desinstalar

```
/plugin uninstall mr-auto-review@wetaca-plugins
/plugin marketplace remove wetaca-plugins
```

> **Nota** (Wave 1): los `subagent_type` declarados en `agents/*.md` y el slash command `/mr-review` se exponen automáticamente al cargar el plugin. El MCP server se arranca on-demand cuando alguna tool `mcp__plugin_mr-auto-review_mr-auto-review__*` se invoca; necesita `dist/index.js` compilado (`cd mcp-server && npm install && npm run build`).

## Estructura

Ver `docs/ARCHITECTURE.md` para el flujo completo y `docs/AGENT-CATALOG.md` para el roster de los 22 agents.
