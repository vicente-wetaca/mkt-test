# Wave 1 — E2E run on a real branch

> Documenta el primer ciclo end-to-end del plugin. Wave 1 termina cuando este doc esté completo con un run REAL (no sólo dry-run).

## Estado actual

| Verificación | Resultado |
|---|---|
| Tests unitarios MCP server (43/43 path-validator + tools) | **PASS** (Task 1.3) |
| Build `tsc` produce `dist/` | **PASS** |
| Smoke MCP server (initialize + tools/list + 4 tools call + traversal block) | **PASS** — ver §1 |
| Dry-run analysis del orquestador sobre el branch actual | **PASS** — ver §2 |
| Run E2E REAL con `/mr-review` desde Claude Code | **PENDING** — ver §3 |
| 4 agent types registrados como subagent_type | **PENDING** — depende del plugin install |
| `REVIEW-SUMMARY.md` real con ≥1 issue + triage correcto | **PENDING** |
| Workspace `.dev/MR-auto-review/<ticket>/` con estructura esperada | **PENDING** |

---

## §1. Smoke test — MCP server (stdio)

Ejecutado el 2026-05-19 contra `dist/index.js` del MCP server bundled.

Protocolo: JSON-RPC over stdio (MCP `2024-11-05`).

```
initialize OK; serverInfo: {"name":"mr-auto-review","version":"0.1.0"}
tools count: 5
 - mr_write
 - mr_read
 - mr_list
 - mr_overwrite
 - mr_signal
mr_write OK; fileId: "R-code-quality/issue-20260519-125630-105.md"
mr_list result: [{ fileId, agentName: "R-code-quality", kind: "issue", timestamp, size: 91 }]
mr_signal result: { ok: true, signalId: "193fe874-7b86-422d-9648-d5ef3a05dff1" }
path traversal blocked: YES (good)
  error: "Error: Path traversal detected: \"../../escape.md\" resolves outside workspace ..."
```

Conclusiones:
- Los 5 tools se exponen correctamente.
- `mr_write` produce paths con timestamp + fileId consistente con el schema.
- `mr_list` devuelve metadata, no contenido (correcto).
- `mr_signal` persiste con UUID válido.
- **Path traversal bloqueado** — capa de seguridad validada (Task 1.3 covers 43 unit tests including symlink escape, NUL bytes, nested traversal).

Reproducir:
```bash
cd .claude/plugins/MR-auto-review/mcp-server
npm test                # 43/43 pass
npm run build           # produces dist/
# Smoke test: ver script inline en .claude/plans/MR-auto-review/handoff notes
```

---

## §2. Dry-run del orquestador (current branch)

> Simula los pasos 1-3 del orquestador (`commands/mr-review.md`) SIN despachar reviewers reales. Útil para validar que la lógica de bucket + concern detection encaja.

**Target del dry-run**: el propio worktree WET-4814 vs un base que excluye el carry-over de WET-4715.

| Paso | Computado | Resultado |
|---|---|---|
| 1 — Context | branch=`worktree-feature+WET-4814--mr-auto-review-plugin`, ticketId regex match | `WET-4814`, mode=`local` |
| 2 — Bucket | files=82 (54 committed + 28 untracked), ~6019 lines | **HUGE** |
| 3 — Concerns | 31 TS files (20 prod, 11 spec), descripción `null` (local mode) | R-code-quality, R-tests, R-mr-hygiene |
| Top dirs | 81 ficheros en `.claude/` (1 en `.gitignore`) | meta-cambio del plugin |

JSON completo persistido en `_context/dry-run-analysis.json` durante el run real (lo escribe el orquestador en el step 4).

Notas operativas:
- Bucket=HUGE → según D8 nunca rechaza pero podría serializar por módulo si ≥3 módulos. Aquí sólo `.claude/` → no aplica serialización.
- Sin spec files cambiados que necesiten review aparte; los .spec.ts del MCP server son del propio plugin (no productivos del repo).
- En un E2E real este branch no es representativo: el contenido es meta (plans + prompts + docs). Para un E2E con señal de issues reales, usar otro branch.

---

## §3. Plan para el run E2E REAL — pendiente

El `/mr-review` requiere que el plugin esté instalado en Claude Code y los 4 `subagent_type` registrados. Pasos exactos:

### 3.1 — Install via marketplace local

Claude Code NO escanea directorios arbitrarios. El plugin se registra a través de un marketplace declarado en `<repo-root>/.claude-plugin/marketplace.json` (committed).

Desde Claude Code (en cualquier directorio):

```
/plugin marketplace add /Users/vicentesempere/Projects/Wetaca_work1/wetaca.com/.claude/worktrees/feature+WET-4814--mr-auto-review-plugin
/plugin install mr-auto-review@wetaca-plugins
/reload-plugins
```

Tres pasos:
1. **`marketplace add`** → registra el marketplace local. Claude Code lee `<path>/.claude-plugin/marketplace.json` y lo añade a `~/.claude/plugins/known_marketplaces.json`.
2. **`install`** → activa el plugin. Añade `mr-auto-review@wetaca-plugins: true` a `~/.claude/settings.json#enabledPlugins`.
3. **`reload-plugins`** → recarga manifests sin reiniciar Claude Code.

> Si ya tenías el symlink antiguo `~/.claude/plugins/local/MR-auto-review` (legacy approach), bórralo: `rm ~/.claude/plugins/local/MR-auto-review`. No causa daño pero no se usa.

### 3.2 — Verificación post-install

Tras reiniciar Claude Code:

- [ ] `/help` muestra `/mr-review` en la lista de slash commands.
- [ ] `agent --list` (o equivalente) muestra `R-code-quality`, `R-tests`, `R-mr-hygiene`, `R-triage`.
- [ ] El MCP server arranca al primer uso (verificable por la aparición de los tools `mcp__plugin_mr-auto-review_mr-auto-review__*` en la lista de tools disponibles).

### 3.3 — Elección de branch de prueba

Candidatos buenos:
- **branch reciente mergeada con ≥5 archivos y mezcla de prod+spec**. Sugerencia: alguno de los WET-4763 subtask E mergeados (cambios variados de tracking).
- **Branch local en curso con cambios moderados** (≤MEDIUM bucket) — más fácil de auditar a mano.

Mal candidato: el propio worktree WET-4814 (todo es meta del plugin; no hay diff de código productivo).

### 3.4 — Ejecución del run

```bash
# Desde la branch de prueba (no en el worktree del plugin):
/mr-review --local
```

Sigue el flujo: gate de equipo → espera dispatch → gate de selección. Tiempo estimado: 10-25 min según bucket.

### 3.5 — Capturar resultados

Para cada run, anotar aquí:

#### Run #1 — `<branch name>` — `<YYYY-MM-DD>`

```
Ticket / Branch:       <...>
Bucket:                <...>
Team activado:         <...>
Tiempo total:          <...>
Tokens consumidos:     <input / output / total>

Issues por specialist:
  R-code-quality:      <count>
  R-tests:             <count>
  R-mr-hygiene:        <count>

Triage:
  Groups:              <count>
  Dedupe collapsed:    <count>
  must-fix × publish:  <count>
  should-fix × *:      <count>
  nit × *:             <count>

Signals:
  KB_GAP:              <count> (detalles: ...)
  BLOCKER_ESCALATION:  <count>
  AMBIGUITY:           <count>

REVIEW-SUMMARY path:   .dev/MR-auto-review/<ticket>/R-triage/report-<ts>.md
```

#### Validación cualitativa del Run #1

Comparar el REVIEW-SUMMARY contra:

- **Code-quality**: ¿Detecta los `as unknown as`, `||` vs `??`, `&&` en JSX, `T[]` vs `Array<T>` que un humano vería?
- **Tests**: ¿Marca `jest.mock` indebidos, casts inline en test bodies, Mothers ausentes? ¿Sugiere tests para nuevos branches?
- **MR-hygiene**: ¿Pilla descriptions vacías, vars sin `.env.example`, posibles secrets?
- **Triage**: ¿Dedupe coherente? ¿Severity asignados con tie-break a la baja? ¿`suggestion_completeness` correcto?

Problemas a documentar:
- [ ] Falsos positivos significativos
- [ ] Falsos negativos (issues que un humano vería pero el plugin no)
- [ ] Issues con `position_unverified: true`
- [ ] Casos donde la persona se estiró más del 10% (recortar prompt si pasa repetidamente)
- [ ] Cualquier `BLOCKER_ESCALATION` que pare el flujo

### 3.6 — Iteración

Si el Run #1 tiene problemas sistemáticos:
1. Anota en `Run #1 notes` debajo.
2. Si es un agent prompt → editar `agents/<name>.md` y re-ejecutar (no cambia el contrato del plugin).
3. Si es el MCP server → fix + tests, re-build, re-test.
4. Si es el orquestador → editar `commands/mr-review.md`.

Documentar Run #2, #3 hasta tener confianza en al menos 1 run útil sin intervenciones manuales.

---

## §4. Verificación final de Wave 1

Wave 1 se cierra cuando TODOS los checks del wave plan §Verification pasan:

- [ ] `/mr-review` arranca desde Claude Code (post-install)
- [ ] Los 4 agent types están registrados
- [ ] MCP server arranca y responde a las 5 tools (smoke test §1 ya OK)
- [ ] `path-validator.ts` pasa tests de traversal (Task 1.3 OK)
- [ ] E2E real produce REVIEW-SUMMARY con ≥1 issue real y triage coherente (§3.5 pendiente)
- [ ] Workspace queda con la estructura esperada
- [ ] **Cero escrituras fuera de `.dev/MR-auto-review/<ticket>/`** durante el run (verificable via `find` + `git status`)

Al cerrar Wave 1, actualizar:
- `WET-4814-plan.md` (status table)
- Memory del proyecto (`project_wet_0000_mr_auto_review.md`) con resumen del run + número de tokens consumidos
- Crear branch `feature/WET-4814--mr-auto-review-plugin` (sin el prefijo `worktree-` que git generó automáticamente) y preparar MR contra master

---

## Limitaciones conocidas en V1 (Wave 1)

1. **Sin scripts library**: el orquestador no usa `scripts/library/compute-mr-size.sh` (Wave 2). Bucket se calcula inline.
2. **Solo 3 specialists activos**: muchos concerns (Mongo, security, infra, perf, etc.) no se cubren. Wave 2 amplía.
3. **Ambiguity batch no re-despacha**: Paso 8 recoge respuestas pero los specialists no se re-llaman; las respuestas las consume R-triage. Wave 2 mejora.
4. **Sin cost caps enforcing**: Wave 4 los implementa. En Wave 1 sólo se documenta el coste observado.
5. **Sin hooks PreToolUse**: tercera capa de defensa (D11) llega en Wave 4.
6. **Sin GitLab/Jira**: output sólo local. Wave 3 añade ambos.
