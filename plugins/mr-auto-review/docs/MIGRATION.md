# Migration — desde `omar-review` skill hacia `mr-auto-review` plugin

> Cómo retirar el skill antiguo (`~/.claude/skills/omar-review/`) y sustituirlo por el plugin `mr-auto-review` ya empaquetado en este repo. Spec: Wave 5.

## Resumen del cambio

| Aspecto | omar-review (antes) | mr-auto-review (después) |
|---|---|---|
| Tipo | Skill plano (markdown) | Plugin Claude Code |
| Sandbox de tools | Soft (toolset textual en prompt) | Real (3 capas: declared toolset + MCP server + hook bundled) |
| Scope de revisión | 1 agente que mira todo | 23 agent types specialistas + R-triage |
| Output | Markdown a stdout | Workspace estructurado + posting GitLab + Jira follow-ups |
| Validación scripts | manual | R-script-auditor + binary allowlist |
| Cost caps | no | sí (D18) — enforcing en Wave 4 |
| Modo CI | no | sí (`--unattended` + `--estimate`) |
| Personas | no | 23 personas con voz reconocible (D25) |

## Prerequisitos

Antes de iniciar el cutover:

1. **Plugin instalado y verde**: el plugin debe estar cargado vía marketplace local `wetaca-plugins`. Verifícalo con `/plugin` en una sesión nueva — debe aparecer `mr-auto-review` activo.
2. **Token GitLab configurado**: `.claude/plugins/MR-auto-review/mcp-server/.env` con `GITLAB_TOKEN` válido (scope `api`).
3. **Tests verdes en local**: `cd .claude/plugins/MR-auto-review/mcp-server && npm test` debe pasar ≥ 200 tests.
4. **Validación de 6 MRs reales completa**: ver `SIX-MR-CHECKLIST.md` — al menos 5/6 con verdict positivo del humano.

## Pasos del cutover

### 1. Backup del skill antiguo

Desde la raíz del repo:

```bash
bash .claude/plugins/MR-auto-review/scripts/cutover-from-omar-review.sh
```

El script:
- Copia íntegro `~/.claude/skills/omar-review/` a `.dev/legacy/omar-review-YYYYMMDD/`.
- Es idempotente (si el backup ya existe, no falla).
- Escribe un `CUTOVER.md` dentro del backup con instrucciones para revertir.
- NO toca `~/.claude/skills/omar-review/` aún — solo respalda.

### 2. Validación con 6 MRs reales

Antes de borrar el skill antiguo, ejecuta el plugin contra 6 MRs reales y compara contra el equivalente humano. Sigue `docs/SIX-MR-CHECKLIST.md`. Criterio de aceptación (D22):

- Cobertura: el plugin detecta ≥ los issues que el reviewer humano detectaría.
- Volumen: total de comments del plugin ≤ 1.5× el del humano (sin inundar).
- Cero alucinaciones: ningún issue cita `file:line` que no existe o regla que no es del repo.

Si ≥5 de 6 MRs pasan → adelante con el paso 3. Si < 5/6 → no hacer cutover; abrir un follow-up para mejorar antes.

### 3. Retirada del skill antiguo

Cuando la validación pasa, retira el skill:

```bash
rm -rf ~/.claude/skills/omar-review
```

A partir de aquí los usuarios que ejecuten `/omar-review` recibirán "command not found" — la búsqueda del comando recae automáticamente en `/mr-review` del plugin.

### 4. Comunicación al equipo

Anuncia en el canal del equipo (#wetaca-tech o equivalente):

```
Hola equipo,
Desde hoy el reviewer automático de MRs es el plugin "mr-auto-review"
(antes era el skill "omar-review", ya retirado).

Comandos:
- /mr-review        — review nueva (autodetect MR o --mr <iid>)
- /mr-review-status — estado del último run
- /mr-review-undo   — revertir comments si algo se publicó por error
- /mr-review-resume — retomar un run interrumpido

Docs: .claude/plugins/MR-auto-review/docs/

Si algo va mal, recuperas el viejo con:
   cp -R .dev/legacy/omar-review-<fecha> ~/.claude/skills/omar-review
```

### 5. Limpieza diferida (opcional, +30 días)

Si tras 30 días con el plugin activo nadie ha tenido que revertir:

- El backup en `.dev/legacy/omar-review-<fecha>/` puede eliminarse manualmente. `.dev/` está gitignored, así que no ocupa espacio en remote, pero sí en disco local.

## Rollback

Si descubres una regresión bloqueante tras el cutover:

```bash
# Restaura el skill viejo (un solo comando)
cp -R .dev/legacy/omar-review-<fecha> ~/.claude/skills/omar-review

# Desactiva el plugin (opcional)
# Edita .claude/plugins/marketplace.json o usa /plugin remove
```

El plugin no toca código de producción, así que un rollback es seguro y rápido. Las MRs ya comentadas no se ven afectadas — los comments quedan donde están.

## Differences que debes saber

### Comportamiento que cambia

- **Output**: omar-review imprimía todo a stdout en una sola pasada. mr-auto-review escribe a `.dev/MR-auto-review/<ticketId>/` (gitignored) y opcionalmente postea a GitLab.
- **Gates humanos**: omar-review era one-shot. mr-auto-review tiene 3 gates (equipo, ambigüedades, selección). En `--unattended` esos gates se sustituyen por políticas.
- **Cost predictability**: omar-review no tenía caps. mr-auto-review sí (D18) — para HUGE puede pedir confirmación o abortar.

### Lo que NO cambia

- Reglas del repo (`.claude/rules/*.md`) siguen siendo la fuente de verdad.
- El humano sigue revisando el output antes de mergear.
- Jira follow-ups siguen siendo opt-in (con gate humano por defecto).

## Limitaciones conocidas tras el cutover

1. **No hay re-review incremental** todavía (Wave 6 §B.1). Cada `/mr-review` empieza desde cero.
2. **No hay trigger por comments humanos** en el MR todavía (Wave 6 §B.2).
3. **No hay hilos conversacionales** entre el bot y los humanos en GitLab todavía (Wave 6 §B.3).

Estas son mejoras de calidad de vida, no bloqueantes.
