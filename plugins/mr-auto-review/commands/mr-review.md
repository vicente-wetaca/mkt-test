---
name: mr-review
description: "Multi-agent MR review for the Wetaca monorepo. Wave 4: catálogo completo (23 agents incl. R-third-party-docs) + scripts library + R-script-auditor + remote-mode con posting + idempotencia issue-hash + marker note + hard cap + error matrix + Jira follow-up tickets + companion commands (status/resume/undo) + --unattended/--estimate/--skip-tests para CI + confidence en triage. Use as: /mr-review [--local|--mr <iid>|--ticketId <WET-####>] [--unattended] [--estimate]."
---

# /mr-review — Orquestador

Eres el **main agent** del plugin MR-auto-review. Tu rol en este comando es **orquestar**, NO revisar tú mismo. Despachas reviewers specialist (R-*) como subagentes y triagador (R-triage) al final. Sigue este guion paso a paso.

> **Wave 3.B = remote mode read-only (autodetect MR + diff/discussions remoto)**. El posting de comments back a GitLab llega en Wave 3.D. Los pasos marcados `[wave-3.D+]` o `[wave-4+]` se ignoran por ahora; documentan el flujo completo para referencia.

---

## Argumentos

| Flag | Default | Efecto |
|---|---|---|
| `--local` | off | Fuerza modo local incluso si hay MR abierta para la branch |
| `--mr <iid>` | off | Fuerza modo remoto contra el MR IID indicado |
| `--ticketId <WET-####>` | autodetect del branch name | Override del ticketId; si no hay match, usa `local-<branch-slug>` |
| `--base <ref>` | `master` | Base ref para el diff; útil si quieres revisar contra una branch distinta |
| `--unattended` (alias `--ci`) | off | Sustituye los 3 gates humanos por políticas automáticas. Cost cap pasa de gate a abort duro. Ver sección "Modo --unattended (D29)" más abajo |
| `--unattended-max-comments=N` | `10` | Cap de comentarios publicados por MR en modo unattended (D34) |
| `--unattended-min-confidence=<high\|medium>` | `high` | Filtro de publicación por confidence en modo unattended (D30) |
| `--unattended-severity-filter=<must-fix\|all>` | `must-fix` | Severidades publicables en modo unattended (default: solo must-fix) |
| `--unattended-cost-cap-multiplier=<N.M>` | `1.5` | Multiplicador del cap por bucket para abort en modo unattended (D18) |
| `--skip-tests` | off | R-tests sigue revisando código de tests pero no ejecuta run-tests-summary.sh (D35). Útil cuando CI ya corre la suite |
| `--estimate` | off | Sub-modo: ejecuta sólo pre-pass + bucketing, imprime JSON `{bucket, estimated_tokens, estimated_cost_usd}` y termina. Exit code 1 si bucket=HUGE (D35) |
| `--include-docs-check` | off | Fuerza activación de R-third-party-docs aunque el diff no toque package.json |

Para los comandos auxiliares ver:
- `/mr-review-status` — estado del workspace activo
- `/mr-review-resume` — retomar review interrumpida
- `/mr-review-undo` — borrar discussions posteadas por la última run

Si NO pasas `--local` ni `--mr`, el orquestador llama `gitlab_find_mr_for_branch(<branch>)` y decide automáticamente:
- 1 match → modo remoto contra ese IID.
- 0 matches → modo local.
- ≥2 matches → presenta la lista al humano y pregunta antes de seguir.

---

## Paso 1 — Detectar contexto

1. `git rev-parse --show-toplevel` → guarda como `$REPO_ROOT`.
2. `git rev-parse --abbrev-ref HEAD` → guarda como `$BRANCH`.
3. `$BASE_REF` = valor de `--base` o `"master"`.
4. Decide `ticketId`:
   - Si el usuario pasó `--ticketId`, úsalo.
   - Si el branch matchea `^[a-z]+/WET-(\d+)--.+$`, extrae `WET-<n>`.
   - Si no, usa `local-<slug-del-branch>` (lowercase, kebab, sin `/`).
5. Decide modo:
   - Si `--local` → modo `local` (definitivo).
   - Si `--mr <iid>` → modo `remote` con `$MR_IID = <iid>`.
   - Si NO hay flag explícito → llama `mcp__plugin_mr-auto-review_mr-auto-review__gitlab_find_mr_for_branch({branch: $BRANCH})`:
     - `matchCount == 0` → modo `local`.
     - `matchCount == 1` → modo `remote` con `$MR_IID = result.iid`. Reporta `Auto-detected MR !<iid>: <webUrl>`.
     - `matchCount >= 2` → presenta la lista al usuario:
       ```
       Encontradas N MRs abiertas para `<branch>`:
       1. !<iid1> updated <date>
       2. !<iid2> updated <date>
       ¿Cuál usar? [1/2/.../local]
       ```
       y aplica la elección.
6. Asegura el workspace: usa `mcp__plugin_mr-auto-review_mr-auto-review__mr_list(ticketId)` para validar que el server crea el workspace base; ignora resultado.

7. **Marker file de ejecución activa** (Wave 4.6 mejora). Escribe `_state/.active` vía `mr_write(ticketId, agentName="_state", kind="state", content=<yaml>)` con `{ticketId, started_at, pid, mode}`. El PreToolUse hook bundled chequea ESE marker — mientras existe, restringe writes fuera del workspace. **Borrar el marker al terminar (éxito, abort, o crash recuperable)** es obligatorio en el Paso 11 — ver "Cleanup del marker" allí.

8. **Resolución de paths del plugin (obligatorio)**. Llama `mcp__plugin_mr-auto-review_mr-auto-review__get_plugin_paths({})` y guarda los paths absolutos resultantes para reutilizar en pasos posteriores:
   - `$PLUGIN_ROOT` = `result.pluginRoot`
   - `$LIBRARY_DIR` = `result.scriptsLibrary` (= `$PLUGIN_ROOT/scripts/library`)
   - `$KB_DIR` = `result.kbDir` (= `$PLUGIN_ROOT/_kb`)
   - `$BINARY_POLICY` = `result.binaryPolicy`
   - `$HOOKS_DIR` = `result.hooksDir`

   **Por qué**: cuando `/mr-review` se ejecuta desde un workspace que NO es el repo del plugin (lo normal — el plugin vive en `~/.claude/plugins/cache/wetaca-plugins/mr-auto-review/<v>/`), las rutas relativas como `scripts/library/<x>.sh` o `_kb/<x>.md` resuelven contra el cwd del usuario y fallan. `get_plugin_paths` devuelve los paths absolutos correctos. A partir de aquí: SIEMPRE estas variables, NUNCA paths relativos al plugin.

Reporta al usuario:
> Repo: <repo>, branch: <branch>, base: <baseRef>, ticketId: <id>, mode: <local|remote>, MR: <iid o '-'>.

---

## Paso 2 — Pre-pass con scripts library

El pre-pass ejecuta los scripts pre-auditados de `$LIBRARY_DIR` (resuelto en Paso 1 paso 8 vía `get_plugin_paths`) y persiste sus outputs JSON en `_context/scripts-output/<script-id>.json`. **NO ejecutes inline lo que ya hace un script de library** — eso fue el rework de Wave 2.6.

### 2.0 — Pre-pass remoto (sólo modo `remote`)

Si `mode == remote`, antes de generar el patch:

1. Llama `mcp__plugin_mr-auto-review_mr-auto-review__gitlab_get_mr({iid: $MR_IID})` y guarda:
   - `$MR_DESCRIPTION`, `$MR_TITLE`, `$MR_AUTHOR`, `$MR_REVIEWERS`
   - `$MR_BASE_SHA`, `$MR_HEAD_SHA`, `$MR_START_SHA`
   - `$MR_WEB_URL`, `$MR_TARGET_BRANCH`
2. Llama `gitlab_get_diff({iid: $MR_IID, ticketId: $TICKET_ID})` y guarda:
   - `$DIFF_PATCH = result.unified_diff_path` (path absoluto — el MCP server YA escribió el unified diff al workspace `_context/diff-iid<N>.patch`). **NO regeneres el fichero con bash + heredoc** — desperdicia contexto LLM con el contenido del diff.
   - `$DIFF_BYTES = result.unified_diff_bytes` (para reporting de tamaño).
   - Los `files` estructurados (con `diff_preview` ≤32 líneas por fichero) quedan disponibles para selección de specialists y bucketing inicial. Para el diff completo de un fichero concreto, los scripts library leen `$DIFF_PATCH` y parsean por `diff --git`.
3. Llama `gitlab_list_discussions({iid: $MR_IID})` y persiste vía `mr_write(ticketId, agentName="_context", kind="context", content=JSON.stringify(...))` como `existing-discussions.json`. Sirve a Wave 3.D para detección de overlap (issue-hash) y al humano para ver lo que ya comentaron.
4. **SHA mismatch check**:
   - `LOCAL_MERGE_BASE = git merge-base "$MR_TARGET_BRANCH" HEAD` (si la branch local existe). Compara con `$MR_BASE_SHA`.
   - Si `$MR_HEAD_SHA != $(git rev-parse HEAD)` → la branch local no está al día con el head del MR. Avisa al humano:
     ```
     ⚠️ HEAD local (<localSha>) difiere de HEAD del MR (<mrSha>).
     La revisión usará el diff REMOTO del MR; el código en disco local puede no coincidir línea-a-línea.
     ¿Continuar? [yes/no]
     ```
   - Si el humano dice `no` → aborta limpio.
5. Construye `mr-metadata.json` aquí (sustituye el Paso 4.2 cuando `mode == remote`):

```json
{
  "ticketId": "<id>",
  "mode": "remote",
  "mrIid": <iid>,
  "branch": "<branch>",
  "baseRef": "<targetBranch del MR>",
  "mrUrl": "<webUrl>",
  "title": "<title>",
  "description": "<description>",
  "author": { "username": "...", "name": "..." },
  "reviewers": [{ "username": "...", "name": "..." }, ...],
  "sha": { "base": "<mrBaseSha>", "head": "<mrHeadSha>", "start": "<mrStartSha>" },
  "localShaMatch": <true|false>,
  "existingDiscussions": <count>,
  "bucket": null,
  "files": [],
  "stats": null,
  "scripts_output_index": []
}
```

(Los campos `bucket`, `files`, `stats`, `scripts_output_index` se completan tras el Paso 3 y el resto del pre-pass — escribe primero un placeholder y haz un `mr_overwrite` después.)

Persiste vía `mr_write(ticketId, agentName="_context", kind="context", content=JSON.stringify(metadata))`.

En modo `local`, este sub-paso se skipea por completo.

### 2.1 — Genera el patch

En modo `local`:
```bash
DIFF_PATCH=$(mktemp)
git diff "$BASE_REF"...HEAD > "$DIFF_PATCH"
```

En modo `remote`, `$DIFF_PATCH` ya está escrito por `gitlab_get_diff` en 2.0 (contiene el unified diff del MR remoto, persistido en `_context/diff-iid<N>.patch` del workspace). NO regenerar con `git diff` — los SHAs locales pueden divergir del MR. NO re-leer el fichero a contexto LLM — los scripts library lo procesan directamente.

### 2.2 — Ejecuta library scripts (siempre)

Para cada script de la library, ejecuta y persiste output. **Usa `$LIBRARY_DIR/<script>` con path absoluto**, no el nombre del script suelto:

| Script | Argumentos | Persiste como |
|---|---|---|
| `bash "$LIBRARY_DIR/compute-mr-size.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `compute-mr-size.json` |
| `bash "$LIBRARY_DIR/stratify-by-module.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `stratify-by-module.json` |
| `bash "$LIBRARY_DIR/detect-mongo-pipelines.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `detect-mongo-pipelines.json` |
| `bash "$LIBRARY_DIR/detect-di-usage.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `detect-di-usage.json` |
| `bash "$LIBRARY_DIR/detect-secrets-touch.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `detect-secrets-touch.json` |
| `bash "$LIBRARY_DIR/detect-env-vars-changes.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `detect-env-vars-changes.json` |
| `bash "$LIBRARY_DIR/detect-react-lazy.sh"` | `"$DIFF_PATCH" "$BASE_REF"` | `detect-react-lazy.json` |
| `bash "$LIBRARY_DIR/detect-vendor-usage.sh"` | `"$DIFF_PATCH" "$BASE_REF" "$REPO_ROOT"` | `detect-vendor-usage.json` |

**Persistencia**: usa `mr_write(ticketId, agentName="_context", kind="scripts-output", content=...)`. El MCP server compone el path final dentro de `_context/scripts-output/`.

NO ejecutes `run-tests-summary.sh` aquí — es caro y se ejecuta sólo si R-tests está activo y el bucket lo justifica (Paso 4 lo decide).

### 2.3 — Scripts ad-hoc (si necesarios) → R-script-auditor

Si necesitas un detector que la library NO cubre (raro):

1. Genera el script ad-hoc en `_scripts/<ad-hoc-name>.sh` vía `mr_write(kind="script")`.
2. **Antes de ejecutarlo**, despacha `R-script-auditor`:
   ```
   Agent(subagent_type="mr-auto-review:R-script-auditor", prompt="<brief con scriptPath>", ...)
   ```
3. Lee el verdict YAML que produce:
   - `verdict: APPROVED` → ejecuta el script.
   - `verdict: NEEDS_HUMAN` → presenta al humano la entrada `pending_binaries` para que decida (permitir/rechazar/reescribir). Aplica la decisión a `$BINARY_POLICY` (path absoluto del Paso 1) y re-audita. **Nota**: este write modifica el fichero del cache del plugin; persiste sólo hasta el siguiente `/plugin install`. Para cambios duraderos, edita también el fichero en el repo del plugin y commitea.
   - `verdict: REJECTED` → **NO** ejecutes. Intenta re-generar el script SIN la violación (máx 2 iteraciones). Si persiste, aborta esa detección concreta.
4. NUNCA ejecutes un script ad-hoc sin verdict APPROVED.

Library scripts skipean el auditor (auditados ya).

---

## Paso 3 — Bucket de tamaño

Lee `_context/scripts-output/compute-mr-size.json`:

```json
{
  "fileCount": N,
  "addedLines": X,
  "removedLines": Y,
  "totalLines": Z,
  "bucket": "TINY|SMALL|MEDIUM|LARGE|HUGE"
}
```

Reporta el bucket al usuario. Para HUGE, ejecuta secuencial por módulo cuando hay ≥3 módulos (ver "Modo secuencial HUGE" más abajo).

### 3.1 — Cost gate (Wave 4.5)

Tras detectar el bucket pero antes del Paso 4, llama:

```
mcp__plugin_mr-auto-review_mr-auto-review__estimate_cost({
  bucket: <BUCKET>,
  specialistsCount: <N planeados>,
  hasTriage: true,
  hasTestsSummary: <true si R-tests activo y NO --skip-tests>,
  mode: <"assisted" | "unattended">,
  multiplier: <opcional; default 1.5>
})
```

Aplica `decision.decision`:

- `continue` → sigue al Paso 4 sin más.
- `human-gate` (modo asistido) → presenta al humano el estimate + `decision.reason` y pregunta `continue / abort`. Si abort → persiste `_report/cost-cap-aborted.yml` y termina.
- `abort` (modo unattended) → persiste `_report/cost-cap-aborted.yml` con `decision.reason` y exit code `2`.

Persiste el estimate completo en `_state/orchestrator-state.yml` bajo `phases.pre_pass.cost_estimate`.

**In-flight re-check**: tras el dispatch (Paso 6) y tras el triage (Paso 9), re-evalúa el cost real consumido (suma de tokens reportados por cada subagent) contra `decision.threshold_tokens`. Si excede:
- Modo asistido: presenta al humano `continue / abort posting`.
- Modo unattended: abort con exit `2`.

---

## Paso 4 — Detectar concerns y activar specialists

Catálogo completo (23 agent types disponibles tras Wave 3.E.b):

### Specialists con activación automática (basada en outputs del pre-pass)

| Specialist | Activación |
|---|---|
| **R-code-quality** | diff toca `.ts/.tsx/.js/.jsx` (mira `stratify-by-module.json.files[].path`) |
| **R-tests** | diff toca `*.spec.ts|*.test.ts|*.spec.tsx|*.test.tsx` OR cambios productivos sin spec compañero. Si bucket ≥ SMALL, ejecuta `run-tests-summary.sh` y persiste output ANTES de despachar el agent |
| **R-mr-hygiene** | siempre activo |
| **R-di** | `detect-di-usage.json.count > 0` OR diff toca `**/use-cases/*.ts` |
| **R-monorepo** | `stratify-by-module.json.distinctModules >= 3` OR diff toca `packages/**|modules/**|shared/**|entities/**|models/**` |
| **R-solid** | diff toca `.ts/.tsx` con `class ` o composiciones complejas (heurística: archivos >300 LOC tocados) |
| **R-homogeneity** | siempre activo (transversal) |
| **R-mongo-aggs** | `detect-mongo-pipelines.json.count > 0` |
| **R-mongo-queries** | diff toca `entities/src/lib/repositories/**` OR grep del diff matchea `.find(|.findOne(|.findOneAndUpdate(` |
| **R-event-types** | diff toca `modules/event-types/**` |
| **R-apollo-cache** | diff toca `frontend/web/src/**/{hooks,api,graphql}/**` OR grep matchea `useQuery|useMutation|client.query|fetchPolicy` |
| **R-perf-frontend** | diff toca `frontend/web/src/**` OR `detect-react-lazy.json.count > 0` OR añade assets pesados |
| **R-perf-backend** | diff toca handlers AMQP (`**/handlers/*.ts`) OR GraphQL resolvers (`**/resolvers/*.ts`) OR jobs/cron |
| **R-infra-protect** | `stratify-by-module.json.modules.infra > 0` OR diff toca `infra/src/**` |
| **R-gitlab-ci** | diff toca `.gitlab-ci.yml|.gitlab/**.yml` |
| **R-migrations** | diff toca `migrations/src/migrations/**` |
| **R-security** | `detect-secrets-touch.json.count > 0` OR `detect-env-vars-changes.json.inconsistent.length > 0` OR diff toca payment/auth/webhook handlers |
| **R-regressions** | diff modifica exports en `.ts/.tsx` (heurística: lineas con `export` en el patch) |
| **R-functional-completeness** | **Hay algún WET-#### identificable** — sea desde el `ticketId` del workspace, desde el branch name del MR (incluso si el flag `--ticketId` lo overrideó a `local-*`), desde el MR title, o desde la description (`Closes WET-####`). Si encuentras cualquiera de esos → ACTIVAR el specialist y pasarle el WET-#### resuelto. **NO skipear sólo porque el workspace `ticketId` empiece por `local-`** — ése es el override del flag CLI para aislar el workspace de runs paralelas, NO una señal de "no hay ticket Jira". El agent valida internamente el acceso a Atlassian MCP y skipea con `issues: []` si no puede resolver el ticket. Si no encuentras ningún WET-#### por NINGÚN camino → entonces sí, skipea con razón explícita. |
| **R-third-party-docs** | `detect-vendor-usage.json.count > 0` (cubre package.json/lockfiles tocados + imports nuevos + uso de deps ya instaladas). El humano puede forzar via `--include-docs-check`. Usa `WebFetch`+`WebSearch` (única excepción entre specialists). El agent recibe `newImports[]` (verificar API contra doc oficial) y `modifiedUsageCandidates[]` (heurística — verificar si son usos nuevos reales o falsos positivos) |
| **R-custom** | invocable bajo demanda — el orquestador puede pedir parametrizado un concern no cubierto. Ver Paso 4.5 |

Si **ningún** specialist se activa → reporta "No hay nada que revisar; el diff sólo toca docs/configs ignoradas" y termina.

### 4.1 — Construye `shared-knowledge.md`

Antes de despachar, escribe el contexto compartido:

- Resumen 1 párrafo del scope del MR.
- Lista de módulos/áreas tocadas (top-level dirs desde `stratify-by-module.json`).
- Conexión con ticket Jira si `ticketId` matchea `WET-\d+` (intenta `mcp__claude_ai_Atlassian__getJiraIssue`; si falla, omite — no es bloqueante).
- Stats del bucket + counts de cada detect-*.

Persiste vía `mr_write(ticketId, agentName="_context", kind="context", content=<markdown>)`.

### 4.2 — Construye/completa `mr-metadata.json`

En modo `local`, escribe el JSON desde cero:

```json
{
  "ticketId": "<id>",
  "mode": "local",
  "branch": "<branch>",
  "baseRef": "<baseRef>",
  "bucket": "<TINY|SMALL|...>",
  "files": ["<list of changed files relative paths>"],
  "stats": { "files_count": N, "lines_added": X, "lines_deleted": Y },
  "commits": [
    { "sha": "<short>", "subject": "<message subject>", "author": "<name>" }
  ],
  "description": null,
  "scripts_output_index": [
    "compute-mr-size.json",
    "stratify-by-module.json",
    "detect-mongo-pipelines.json",
    "detect-di-usage.json",
    "detect-secrets-touch.json",
    "detect-env-vars-changes.json",
    "detect-react-lazy.json"
  ]
}
```

Persiste vía `mr_write(ticketId, agentName="_context", kind="context", content=JSON.stringify(metadata))`.

En modo `remote`, el fichero ya existe (Paso 2.0). Hay que **completar** los campos `bucket`, `files`, `stats`, `scripts_output_index` que quedaron como placeholders. Usa `mr_overwrite` sobre el mismo `fileId`:

```
mr_overwrite(ticketId, fileId=<mr-metadata.json>, content=JSON.stringify({ ...previo, bucket, files, stats, scripts_output_index }))
```

No tocar los campos remote-only (`mrIid`, `mrUrl`, `sha`, `author`, `reviewers`, `localShaMatch`, `existingDiscussions`).

---

## Paso 4.5 — R-custom (opcional, bajo demanda)

Si detectas en el diff un concern recurrente NO cubierto por specialists existentes, puedes despachar `R-custom` con un brief parametrizado:

```
Agent(subagent_type="mr-auto-review:R-custom", prompt="<concern_brief>", ...)
```

El `concern_brief` incluye:
- Nombre del concern (e.g. "i18n strings consistency").
- KB references opcionales (path a docs internos).
- File slice asignado.

R-custom emite issues con el mismo schema YAML que los specialists.

NO uses R-custom para concerns que YA tienen specialist (sería duplicación).

---

## Paso 5 — Gate humano: confirmación de equipo

Presenta al usuario:

```
Plan de review
- Ticket:    <ticketId>
- Branch:    <branch> vs <baseRef>
- Bucket:    <bucket> (<files_count> files, <lines_changed> lines)
- Mode:      <local|remote>
- Team:      <lista de R-* activos>
- Workspace: .dev/MR-auto-review/<ticketId>/
```

Si `mode == remote`, añade:

```
- MR:        !<iid> "<title>" <webUrl>
- Author:    <name> (@<username>)
- Reviewers: @<u1>, @<u2>
- Existing:  <count> discussions ya presentes
- SHA:       base=<short> head=<short> (local match: <yes|no>)
```

Después:

```
Concerns detectados via scripts library:
- mongo pipelines: <count>
- di usage: <count>
- secrets/env touch: <count>
- react lazy: <count>
- env vars inconsistencias: <list>

¿Lanzo el equipo? [yes/no/edit]
```

- `yes` → continúa al Paso 6.
- `no` → aborta limpiamente.
- `edit` → permite quitar/añadir specialists antes de lanzar (regenera el plan).

---

## Paso 6 — Dispatch paralelo de specialists

Lanza TODOS los specialists activos en UNA SOLA respuesta con múltiples `Agent` tool calls. Patrón:

```
Agent(subagent_type="mr-auto-review:R-code-quality", prompt="<brief>", ...)
Agent(subagent_type="mr-auto-review:R-tests",        prompt="<brief>", ...)
Agent(subagent_type="mr-auto-review:R-mr-hygiene",   prompt="<brief>", ...)
Agent(subagent_type="mr-auto-review:R-di",           prompt="<brief>", ...)
...
```

Cada brief incluye:
- `ticketId`
- `repoRoot` (absolute path)
- `pluginKbPath` (absolute path al KB del concern, p.ej. `$KB_DIR/code-quality.md`). El specialist DEBE usar este path absoluto en Read — los paths relativos tipo `.claude/plugins/MR-auto-review/_kb/<x>.md` no resuelven cuando `/mr-review` corre desde un workspace distinto al repo del plugin.
- Reminder de los inputs que debe leer (`_context/shared-knowledge.md`, `_context/scripts-output/<relevant>.json`, KB del concern vía `pluginKbPath`, reglas globales).
- Recordatorio: NO commitear, NO postear a GitLab, NO usar Bash/Edit/Write fuera del MCP.

> **Subagents NO heredan CWD** del worktree (si se ejecuta dentro de uno): instruye a cada uno a usar paths ABSOLUTOS empezando por `$REPO_ROOT`.

Espera a que TODOS terminen antes del Paso 7.

---

## Paso 6.5 — Run-tests-summary (si R-tests activo y bucket ≥ SMALL)

Antes del dispatch a R-tests (o EN PARALELO con los demás specialists si el tiempo aprieta), ejecuta:

```bash
WORKSPACE_ROOT="$REPO_ROOT" bash "$LIBRARY_DIR/run-tests-summary.sh" <test paths del diff>
```

Persiste output como `_context/scripts-output/run-tests-summary.json`. R-tests lo lee en sus inputs.

Si el output tiene `timeout: true`, R-tests lo verá y reportará como `KB_GAP` (test suite muy pesada — necesita refinamiento).

---

## Paso 7 — Revisión de signals

Tras el dispatch:

1. Lee `_signals/log.jsonl` via `mr_list(ticketId, filters={ kind: "issue" })` + manual parse del log si necesitas.
2. Agrupa por tipo:
   - `KB_GAP` → informa al usuario al final.
   - `BLOCKER_ESCALATION` → para el flujo, presenta al usuario, espera decisión.
   - `SCOPE_EXPANSION_REQUEST` → presenta al usuario; si aprueba, despacha R-custom con el brief expandido.
   - `AMBIGUITY_NEEDS_HUMAN` → al Paso 8.

---

## Paso 8 — Batch de ambigüedades (si las hay)

Para cada `AMBIGUITY_NEEDS_HUMAN` pendiente:
- Presenta al usuario el bloque (agentName + payload).
- Recoge respuesta libre.
- Persiste la respuesta vía `mr_write(ticketId, agentName="_context", kind="context", content=<answer>)`.

En Wave 2 las respuestas se hacen accesibles al triage; los specialists NO se re-despachan (Wave 4 lo soportará).

---

## Paso 9 — Dispatch R-triage

Lanza `Agent(subagent_type="mr-auto-review:R-triage", ...)` con brief mínimo:

- `ticketId`
- Recordatorio de leer TODOS los `issues-*` y los `_context/*` vía MCP.
- Recordatorio: 2 outputs (groups + review-summary), ambos kind="report", diferenciados por `subkind:` en el body.
- Aplicar matriz severity×outcome (incl. `needs-human-decision`), tie-break a la baja, asignar `suggestion_completeness`.

Espera a que termine.

---

## Paso 10 — Gate humano: selección final

Lee el `review-summary-<ts>.md` que escribió triage con `mr_list` + `mr_read`. Presenta al usuario su contenido (no resumas — pásalo tal cual).

Después pregunta:

```
Selección:
- ¿Algún group cuyo outcome quieres cambiar? (ej: g-002 publish → reject)
- ¿Algún group cuyo severity quieres re-evaluar?
- ¿Algún group cuyo outcome es needs-human-decision a resolver?
- ¿OK con el resto?
```

Aplica los cambios solicitados directamente en una nueva versión del summary (via `mr_overwrite` sobre el fichero), preservando el groups-*.md original (auditable).

### 10.bis — Composición de bodies + idempotencia (sólo modo `remote`)

Para CADA group con `outcome: publish` (tras la selección humana), prepara el body final que se publicará en GitLab usando los tools del MCP:

1. `gitlab_compose_discussion_body({agentName, personaOpener?, severity, groupId, bodyMarkdown, detectors, confidence, filePath, lineNumber})` → devuelve `{body, issueHash}`.
   - `bodyMarkdown` es el cuerpo sustantivo del issue (la "razón + fix sugerido"), sin chrome.
   - `agentName` es el ID técnico (p.ej. `R-gitlab-ci`).
   - **`personaOpener` (OBLIGATORIO si el agente tiene persona en `docs/AGENT-CATALOG.md`)**: una sola línea italic de apertura ≤120 chars que da voz a la persona del agente. Lo generas TÚ en este paso. **Proceso obligatorio POR group (no por agente)** para evitar cross-contamination:

     1. **Antes de cada `gitlab_compose_discussion_body`, vuelve a leer fresco `$PLUGIN_ROOT/agents/<agentId>.md`**. NO te fíes de personas leídas en groups anteriores — la sesión recuerda metáforas y las mezcla.
     2. Extrae del bloque `## Persona`:
        - La descripción corta (1 línea: "X — Y").
        - Las "Plantillas de tic (úsalas o adapta)" — la lista bullet.
     3. Compón el opener usando **EXCLUSIVAMENTE el tic del agente actual**, atado al título del finding. Reglas duras:
        - **NUNCA tomes prestada metáfora de OTRO agente del mismo run.** Si Filomeno el Maquinista (R-gitlab-ci) habla de "vagones", Carmina la Anteojos (R-homogeneity) **NUNCA** habla de "vagones" — su tic es "esto ya existe en X".
        - Si la persona del agente NO tiene relación temática con un dominio (trenes, tuberías, ojos, lupa, etc.), NO inventes uno tomando prestado de un agente anterior.
        - El opener debe ser reconocible como esa persona aunque se lea aislado, sin el contexto de los anteriores.
     4. Ejemplos canónicos por agente (cita verbatim o adapta MUY ligeramente):
        - R-gitlab-ci (Filomeno el Maquinista, ferrocarril): `Filomeno el Maquinista marca el vagón mal estacionado:` / `... señala el vagón sin enganchar:`
        - R-homogeneity (Carmina la Anteojos, "esto ya existe en X"): `Carmina la Anteojos: esto ya existe en .prepare-pulumi —` / `Carmina la Anteojos pone el dedo en el patrón duplicado:` (sin metáforas externas — su tic es señalar duplicaciones).
        - R-mr-hygiene (Eustaquia la Histérica, histérica/quisquillosa): `Eustaquia la Histérica chasquea la lengua ante el título:` / `Eustaquia la Histérica baja la lupa a la description:`
        - R-mongo-aggs (Ceferino el Tuberías, fontanero): `Ceferino el Tuberías huele un \`$unwind\` mal soldado:` / `Ceferino el Tuberías destapa el pipeline:`
     5. **Si el agente NO tiene persona declarada** (caso raro: R-custom con brief sin persona, o si fallaras al encontrar el block): omite `personaOpener` (no inventes un opener "genérico bot" — preferimos un comment sin opener a uno que contamine).
   - Los demás campos vienen del triage output.
   - El `body` resultante ya lleva los 3 elementos canónicos (prefijo 🤖 con `agentName` puro · severity, opener italic opcional, sign-off cursiva, feedback prompt).
   - El `issueHash` es determinista — si re-ejecutas el plugin, mismo issue → mismo hash. **El `personaOpener` NO entra en el hash** (cosmético): varía el opener entre runs, el hash queda igual.

2. Persiste el body compuesto + hash en `_report/discussion-bodies/<groupId>.yml` (vía `mr_write`).

3. Sólo en modo `remote`: tras tener todos los bodies compuestos, llama `gitlab_list_known_issue_hashes({iid: $MR_IID})`:
   - Para cada group cuyo `issueHash` ya esté en `result.hashes` → marcar `outcome_effective: skipped-duplicate` y persistir a `_report/skipped-duplicates.yml`.
   - Si el matching `result.hashes[hash].resolved == true` → tratar como "ya conocido y resuelto"; tampoco re-publicar.
   - Si NO está en `result.hashes` pero un humano podría haberlo borrado entre runs → no podemos saberlo desde aquí; persistir a `_report/maybe-removed-previously.yml` sólo si el orquestador tiene memoria de un hash que ya posteó (futuro, requiere persistencia cross-run).

4. Reporta al usuario:

```
Bodies preparados:  <N> groups → composición OK
Hashes ya en MR:    <K> duplicates (skipped)
Bodies a publicar:  <N-K> (preview en _report/discussion-bodies/)
```

En modo `local` salta directamente al Paso 11. En modo `remote` continúa con 10.ter.

### 10.ter — Hard cap de publicación (sólo modo `remote`)

Carga los bodies preparados (excluidos los skipped) y aplica el cap configurable:

1. Lee `--unattended-max-comments=N` (default `10`).
2. Construye el array de `RankableGroup` con `{groupId, severity, confidence, detectorCount}` por cada body preparado.
3. Llama al util `rankAndCapGroups({groups, cap})` (importado del MCP server vía un wrapper bash si fuese ad-hoc; en la práctica el orquestador puede aplicar la lógica directamente en JS si tiene acceso, o vía un script de library — Wave 3.E lo cierra). Por ahora **el orquestador puede replicar la lógica manualmente**: ordena por `(severity DESC, confidence DESC, detectorCount DESC)` con tie-break por orden de entrada, toma los primeros N.
4. Persiste:
   - `_report/posted-discussions-plan.yml` con los `toPublish`.
   - `_report/not-published.yml` con los `overCap` (cada entrada: `{groupId, reason: "over-cap-N"}`).

### 10.quater — Posting real + marker note (sólo modo `remote`)

**Pre-flight SHA re-check** — antes de empezar el bucle, vuelve a llamar `gitlab_get_mr({iid: $MR_IID})` y compara `head_sha` con `$MR_HEAD_SHA` (capturado en Paso 2.0):

- Si **coinciden** → continúa con el bucle abajo.
- Si **difieren** (alguien pusheó al MR entre Paso 2.0 y ahora) → **aborta el posting completo**:
  1. Persiste `_report/aborted-posting.yml`:
     ```yaml
     reason: sha-mismatch-during-review
     expected_head_sha: <MR_HEAD_SHA original>
     actual_head_sha:   <head_sha actual>
     groups_planned:    <list de groupIds que iban a publicarse>
     timestamp:         <ISO 8601 UTC>
     ```
  2. **NO postear marker note** (la ausencia indica run no exitoso).
  3. Avisa al humano:
     ```
     ⚠️ La MR ha avanzado durante la review (HEAD <orig> → <nuevo>).
     Posting abortado. Los bodies preparados quedan en
     _report/discussion-bodies/ para retry manual o un nuevo /mr-review.
     ```
  4. Salta directamente al Paso 11 con `posted=0`, `aborted=true`.

Si el pre-flight pasa, bucle sobre `toPublish` (orden determinista):

1. Para cada group, llama `gitlab_create_discussion` con el cuerpo y la `position` apropiada para el tipo de línea. La regla viene del contrato del API de GitLab — equivocarse aquí hace que el comment se cree con metadata de fichero pero **NO aparezca inline en la vista Changes**.

   **Identifica el tipo de línea consultando los hunks del unified diff** (lee `$DIFF_PATCH` o el `diff_preview` por fichero):
   - Línea con prefijo `+` (añadida en este MR) → **ADDED**
   - Línea con prefijo `-` (eliminada en este MR) → **DELETED**
   - Línea sin prefijo (contexto dentro de un hunk) → **CONTEXT**

   **Pattern por tipo (modificación a fichero EXISTENTE, caso común)**:

   ```jsonc
   // ADDED line — el fichero existía, sólo la línea es nueva
   {
     iid: $MR_IID,
     body: <body>,
     position: {
       base_sha: $MR_BASE_SHA,
       start_sha: $MR_START_SHA,
       head_sha: $MR_HEAD_SHA,
       position_type: 'text',
       new_path: <filePath>,
       new_line: <N>,
       // old_path: se autocompleta a new_path por el MCP (D33 fix); omítelo
       // old_line: NO pasar (la línea no existe en el old)
     }
   }

   // DELETED line — el fichero existía, la línea fue eliminada
   {
     position: {
       ..., position_type: 'text',
       new_path: <filePath>,  // mismo path; old_path autocompleta
       old_line: <N>,
       // new_line: NO pasar (la línea ya no existe en el new)
     }
   }

   // CONTEXT line — la línea existe IDÉNTICA en ambos
   {
     position: {
       ..., position_type: 'text',
       new_path: <filePath>,
       new_line: <N_new>,
       old_line: <N_old>,
     }
   }
   ```

   **CRÍTICO**: NO pases `old_path: null` para ficheros modificados. El MCP server autocompleta `old_path = new_path` cuando lo omites — déjalo trabajar. Si pasas `null` explícito, GitLab interpreta "fichero brand-new" y rompe el render inline aunque el fichero ya existiera.

   **Cuándo SÍ pasar `old_path` explícito**:
   - Fichero renombrado → `old_path` distinto a `new_path`
   - Fichero brand-new añadido por este MR → `old_path` ausente / explícitamente undefined (el MCP lo deja como GitLab quiera)
2. Persiste `{groupId, discussionId, firstNoteId, issueHash}` en `_report/posted-discussions.yml` tras cada POST exitoso.
3. Si falla un POST individual (status 4xx con position rechazada) → re-intenta el MISMO body sin `position` (queda como general MR comment). Marca el resultado con `position_dropped: true` en `posted-discussions.yml`. Si vuelve a fallar → persiste en `_report/posting-errors.yml` y continúa con el siguiente group.

Cuando termine el bucle (todos exitosos o con errores graciosos), postea el marker note:

1. Construye el body con `composeMarkerNote` (util de `src/util/marker-note.ts`):
   ```
   {
     headSha:          $MR_HEAD_SHA,
     timestamp:        ISO 8601 UTC,
     publishedCount:   toPublish.length - len(posting-errors),
     totalDetected:    bodies preparados antes de cualquier filtro,
     filteredByPolicy: skipped-duplicates + selección humana de "reject",
     filteredByCap:    overCap.length,
     tokensSpent:      acumulado del run (estimado),
     bucket:           bucket del Paso 3,
     pluginVersion:    valor LITERAL del campo "version" en $PLUGIN_ROOT/.claude-plugin/plugin.json (p.ej. "0.2.2"). NO uses wave labels ("wave-3.E"), NO uses fechas, NO inventes. Si no puedes leer plugin.json, omite el marker antes que pasar un valor incorrecto.,
   }
   ```
2. Llama `gitlab_create_mr_note({iid: $MR_IID, body})`.
3. Persiste el `noteId` en `_report/marker-note.yml`.

**Si el orquestador ABORTA (cost cap exceeded, crash, ctrl-C)**: NO postear marker. La ausencia del marker indica que la última ejecución no terminó limpia.

Reporta al usuario antes del Paso 10.quinquies:

```
Posting completado:
  Publicados:        <P>
  Errores graciosos: <E> (en _report/posting-errors.yml)
  Marker note:       !<noteId>
```

### 10.quinquies — Follow-up tickets en Jira

Aplica a CUALQUIER modo (local o remote) siempre que (a) haya groups con `outcome: follow-up` en el triage Y (b) el ticket origen del MR matchee `WET-\d+` (modo local-* no genera follow-ups Jira automáticamente — el usuario puede saltarlo).

**Localización**: el proyecto WET es de habla hispana. Los `summary` que pasas a `jira_compose_followup_draft` deben ir en **español** (ya están en español en el `title` del triage; tradúcelos sólo si por error han salido en inglés). La descripción se rendea con chrome en español por la util.

1. **Filtra**: del triage final, recoge los groups cuyo `outcome` o `outcome_effective` sea `follow-up`. Si no hay ninguno → salta al Paso 11.

2. **Descubre el sprint "To be reviewed"** (una vez por run, antes de componer drafts). Llama:
   ```
   mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql({
     cloudId,
     jql: 'project = WET AND sprint = "To be reviewed"',
     fields: ["customfield_10020"],
     maxResults: 1,
   })
   ```
   - Si `issues.nodes[0].fields.customfield_10020[0].id` existe → guarda como `$SPRINT_ID` (entero, p.ej. `24`).
   - Si NO existe (sprint vacío o renombrado) → continúa con `$SPRINT_ID = null`; el ticket se creará sin sprint y con la label `to-be-reviewed-sprint` como fallback.
   - **NO hardcodees el sprint id**: rota con el calendario. Descúbrelo cada run.

3. **Compone drafts**. Para cada group, llama:
   ```
   mcp__plugin_mr-auto-review_mr-auto-review__jira_compose_followup_draft({
     groupId, summary, mrIid, mrUrl, ticketId,
     occurrences: [{filePath, lineNumber, excerpt?}, ...],
     suggestedFix: <WHY/FIX/ALTERNATIVA del triage, opcional>,
     severity, confidence,
     extraLabels: [<módulos tocados>, <ticketId>],
   })
   ```
   Persiste TODOS los drafts vía `mr_write(kind="report")` en un único fichero `_report/jira-followups.yml` con la forma:
   ```yaml
   followups:
     - group_id: G-007
       draft:
         summary: "<...>"
         description: "<...>"
         labels: [...]
         priority: medium
       approved: null   # se rellena tras el gate
       created:  null   # IID Jira si se crea
   ```

4. **Gate humano (batch o uno por uno)**. Presenta al usuario:

```
Follow-up tickets propuestos (<N>):

1. G-007 — Refactor: eliminate `as unknown as` casts in payments service
   Severity: should-fix · Confidence: high · Occurrences: 3
   Labels: mr-auto-review, tech-debt, to-be-reviewed-sprint, payments

2. G-011 — Mongoose 5.x EOL — migrate to v8
   Severity: should-fix · Confidence: high · Occurrences: 1
   Labels: mr-auto-review, tech-debt, to-be-reviewed-sprint, deps

¿Aprobar y crear?
  - all     → crear los N
  - 1,3     → crear sólo esos
  - none    → no crear ninguno
  - cancel  → aborta el bloque (no toca Jira; los drafts quedan en _report/)
```

Aplica la elección al fichero (`approved: true|false` por entrada).

5. **Crea los aprobados** vía `mcp__claude_ai_Atlassian__createJiraIssue`. Por cada uno:
   - Argumentos top-level: `cloudId`, `projectKey: "WET"` (o el inferido del `ticketId`), `summary` (en **español**), `description` (markdown del draft, ya en español por la util), `issueTypeName: "Tarea"` (Spanish project — usa `"Tarea"`, NO `"Task"`).
   - `additional_fields` (objeto): `{ "priority": { "name": <map severity → "High"|"Medium"|"Low"> }, "labels": <draft.labels>, ...sprint }` donde `...sprint` es `{ "customfield_10020": $SPRINT_ID }` SI `$SPRINT_ID !== null`, en caso contrario omite el campo.
   - Ejemplo (sprint encontrado):
     ```json
     {
       "cloudId": "0f706380-45cb-48de-89fe-ec0241bbe425",
       "projectKey": "WET",
       "issueTypeName": "Tarea",
       "summary": "<en español>",
       "description": "<markdown del draft>",
       "additional_fields": {
         "priority": { "name": "High" },
         "labels": ["mr-auto-review", "tech-debt", "to-be-reviewed-sprint", "WET-4812"],
         "customfield_10020": 24
       }
     }
     ```
   - Si la llamada falla → persiste `_report/jira-failed.yml` con `{groupId, error, draft}` y CONTINÚA con el siguiente. NO aborta el flujo entero.
   - Si el sprint quedó sin asignar (porque `$SPRINT_ID` era null o porque la API rechazó el campo) → reporta en el resumen final: `"Sprint 'To be reviewed' no encontrado; tickets quedan en backlog con label to-be-reviewed-sprint"`. El humano lo mueve a mano.

6. **Persiste resultado**. Crea/sobrescribe `_report/jira-created.yml`:
   ```yaml
   created:
     - group_id: G-007
       jira_key: WET-5012
       jira_url: https://wetaca.atlassian.net/browse/WET-5012
       created_at: <ISO 8601 UTC>
   skipped:
     - group_id: G-011
       reason: human-declined
   failed:
     - group_id: G-013
       error: <mensaje>
   ```

Reporta al usuario antes del Paso 11:

```
Follow-up tickets:
  Drafts:   <N>
  Created:  <C> (ver _report/jira-created.yml)
  Failed:   <F> (ver _report/jira-failed.yml)
  Declined: <D>
```

---

## Paso 11 — Output final (modo local o remote)

Imprime al usuario en stdout:

```
Review completa (modo <local|remote>, Wave 3.B).

Workspace: .dev/MR-auto-review/<ticketId>/
Summary:   <path absoluto al review-summary>
Groups:    <path absoluto al groups>
```

Si `mode == remote`, añade:

```
MR:        !<iid> <webUrl>
Existing:  <count> discussions previas leídas a _context/existing-discussions.json
```

Después (común a ambos modos):

```
Scripts library outputs:
  - compute-mr-size.json, stratify-by-module.json
  - detect-mongo-pipelines, detect-di-usage, detect-secrets-touch,
    detect-env-vars-changes, detect-react-lazy
  - run-tests-summary (si aplicable)

Issues por agent (sólo los que produjeron):
  - <agent-name>: <path>
  ...

Signals:   <count> (KB_GAP=N, BLOCKER=N, AMBIGUITY=N, SCOPE=N)

Para revisar:
  cat <path al summary>
```

Si `mode == remote`, añade al final:

```
Posted in MR !<iid>:  <P> discussions
Skipped (duplicates): <D>
Over cap:             <C>
Marker note:          !<noteId>
```

Si hubo follow-ups Jira (en cualquier modo):

```
Jira follow-ups:      <C> created, <F> failed, <D> declined
```

### Cleanup del marker (obligatorio)

Antes de terminar, **borra** el marker `_state/.active` que escribiste en el Paso 1.7:

- Modo éxito: borra al final del Paso 11.
- Modo abort (cost cap, SHA mismatch, auth fail, signals BLOCKER): borra antes de emitir el exit code.
- Si crashea Claude Code mid-run: el marker queda en disco. El usuario lo borra a mano (`rm .dev/MR-auto-review/_state/.active`) para volver a tener edición libre fuera del workspace.

El borrado **no es opcional**: el hook bundled (PreToolUse) se basa en este marker para activarse. Si no se borra, el siguiente turno del usuario (fuera de `/mr-review`) verá writes bloqueados.

Termina.

---

## Notas operativas

- **NO commitear** nada durante el flujo. Todo queda en working tree + workspace.
- **Modo local**: trabajas contra `$BRANCH vs $BASE_REF`. Si no hay diferencias → reporta y termina.
- **Sandbox**: los subagents no heredan EnterWorktree; pásales paths absolutos.
- **Si una herramienta MCP falla**: reporta el error tal cual al usuario y aborta — NO inventes datos.
- **Persistencia entre pasos**: todo va al workspace `.dev/MR-auto-review/<ticketId>/` vía MCP. Si te interrumpen, los outputs ya escritos se mantienen.
- **Library scripts NO pasan por auditor** (audited al añadirse a la library). Solo los ad-hoc.
- **R-functional-completeness mode-guard**: si no hay ticketId Jira válido, el agent escribe `issues: []` con `skip_reason` y termina sin consumir tokens — no necesitas filtrarlo tú.

---

## Checkpoint-writes (Wave 4.4)

El orquestador escribe `_state/orchestrator-state.yml` tras CADA paso significativo via `mr_overwrite` (o `mr_write` la primera vez). Esto permite a `/mr-review-resume` retomar tras crash/interrupción.

**Pasos que escriben checkpoint** (por orden):

| Paso | Trigger | Campos a actualizar en el state |
|---|---|---|
| 1 | Inicio | `ticketId`, `mode`, `mr_iid`, `branch`, `base_ref`, `last_step: started`, `tokens_spent: 0` |
| 2.0 | Tras pre-pass remoto (sólo remote) | `phases.pre_pass.mr_metadata_completed_at`, `sha.base/head/start`, `local_sha_match`, `existing_discussions` |
| 2.2 | Tras scripts library | `phases.pre_pass.scripts_done`, `phases.pre_pass.detect_signals` |
| 3 | Tras bucket | `phases.pre_pass.bucket`, `phases.pre_pass.completed_at`, `last_step: pre-pass` |
| 4 | Tras selección de team | `phases.team_planned.specialists`, `last_step: team-planned` |
| 5 | Tras gate humano (o auto en --unattended) | `phases.team_approved.completed_at`, `phases.team_approved.team` |
| 6 | Tras dispatch + esperar todos | `phases.dispatch.specialists_finished`, `phases.dispatch.issues_emitted_total`, `phases.dispatch.completed_at`, `last_step: dispatch` |
| 6.5 | Tras run-tests-summary (si aplicable) | `phases.run_tests_summary.completed_at`, `phases.run_tests_summary.timeout` |
| 7 | Tras lectura signals | `phases.signals.count_by_type`, `phases.signals.completed_at` |
| 8 | Tras ambiguity batch (si aplicable) | `phases.ambiguities.resolved`, `phases.ambiguities.skipped` |
| 9 | Tras triage | `phases.triage.groups`, `phases.triage.severity_counts`, `phases.triage.outcome_counts`, `phases.triage.confidence_counts`, `phases.triage.completed_at`, `last_step: triage` |
| 10 | Tras selección humana (o auto en --unattended) | `phases.selection.completed_at`, `phases.selection.published`, `phases.selection.filtered`, `last_step: selection` |
| 10.bis | Tras composición + dedup | `phases.composition.bodies_prepared`, `phases.composition.skipped_duplicates`, `last_step: composition` |
| 10.ter | Tras hard cap | `phases.cap.over_cap_count`, `last_step: cap` |
| 10.quater | Tras posting (cada N posts o al final) | `phases.posting.posted`, `phases.posting.posting_errors`, `phases.posting.position_dropped`, `phases.posting.completed_at`, `last_step: posting` |
| 10.quater (final) | Tras marker note | `phases.marker.note_id`, `phases.marker.completed_at`, `last_step: marker` |
| 10.quinquies | Tras Jira | `phases.jira.created`, `phases.jira.failed`, `phases.jira.skipped`, `phases.jira.completed_at`, `last_step: jira` |
| 11 | Tras output final | `last_step: done`, `completed_at` global |

**Formato canónico**: ver `commands/mr-review-resume.md`. Resumen del esqueleto:

```yaml
ticketId: WET-4814
mode: remote               # local | remote | unattended
mr_iid: 3802               # null si local
last_step: triage          # ver tabla arriba
last_step_completed_at: 2026-05-20T15:00:00Z
started_at: 2026-05-20T14:00:00Z
completed_at: null         # ISO 8601 cuando last_step == done

phases:
  pre_pass: { completed_at, bucket, files_changed, detect_signals }
  team_planned: { completed_at, specialists }
  team_approved: { completed_at, team }
  dispatch: { completed_at, specialists_finished, issues_emitted_total }
  run_tests_summary: { completed_at, timeout }
  signals: { completed_at, count_by_type }
  ambiguities: { completed_at, resolved, skipped }
  triage: { completed_at, groups, severity_counts, outcome_counts, confidence_counts }
  selection: { completed_at, published, filtered }
  composition: { completed_at, bodies_prepared, skipped_duplicates }
  cap: { completed_at, over_cap_count }
  posting: { completed_at, posted, posting_errors, position_dropped }
  marker: { completed_at, note_id }
  jira: { completed_at, created, failed, skipped }

tokens_spent: 184320
cost_estimate_usd: 1.85
```

**Reglas duras**:

1. **El state se escribe TRAS** completar cada paso (no antes). Si el orquestador crashea durante el paso, el state refleja el último COMPLETO.
2. **Los counters son incrementales y monotonous-non-decreasing** dentro de una run. Si una fase se retoma con `--from-step`, los counters se RESETEAN a 0 para esa fase y posteriores.
3. **El state NO se borra automáticamente**. Persiste como auditoría incluso tras `last_step: done`.
4. **El path es estable**: `_state/orchestrator-state.yml` (un solo fichero, no versionado por timestamp — siempre sobrescribir).
5. **Si la escritura del state falla** (poco probable, el MCP path-validator nunca debería rechazarlo), el orquestador continúa el flujo principal y emite un signal `KB_GAP` con `payload: { reason: "state-write-failed", step: <step> }` para alertar.

---

## Modo secuencial HUGE (D15, Wave 4.7)

Cuando el bucket es `HUGE` Y el diff toca ≥3 módulos top-level (`stratify-by-module.json.distinctModules >= 3`), el orquestador NO despacha todos los specialists en paralelo. En su lugar:

1. **Pide el plan al tool MCP** `compute_huge_partitions({modules, candidateSpecialists, hasTriage, hasTestsSummary, perWaveBucket?})`:
   - `modules` ← entradas de `stratify-by-module.json` (`module`, `files` count, `paths`).
   - `candidateSpecialists` ← lista de R-* que el Paso 4 activaría sobre el diff completo.
   - Resultado: `{waves: [{wave, module, files, specialists, estimated_tokens, estimated_cost_usd}], total_waves, total_estimated_tokens, total_estimated_cost_usd}`.
   - Persiste a `_state/huge-partitions.yml` (vía `mr_write` con el JSON serializado).
   - El tool ordena las olas por `files` descendente (ola más grande primero, para detectar problemas estructurales temprano) y filtra specialists por afinidad de módulo (transversales mantienen en todas; R-perf-backend solo en `services/`, R-apollo-cache solo en `frontend/`, etc.).
2. **Para cada ola** (secuencialmente):
   - Aísla el subset del `DIFF_PATCH` que toca SOLO ese módulo (vía `git diff "$BASE_REF"...HEAD -- <módulo>`).
   - Persiste `_context/wave-<N>-diff.patch`.
   - Re-ejecuta los scripts library SÓLO sobre el subset (compute-mr-size, stratify-by-module, detect-*).
   - Activa los specialists que apliquen al módulo (R-monorepo siempre; los demás según patrón).
   - Dispatch + signals + ola termina.
   - Persiste `_state/waves/wave-<N>-state.yml` con counts.
3. **Tras cada ola**, gate humano (modo asistido): "Ola <N>/<total> terminó. ¿Continuar? [yes/no/skip-remaining]". En `--unattended` se acepta automáticamente.
4. **Tras la última ola**, el orquestador lanza R-triage UNA SOLA VEZ con todos los `issues-*.md` de TODAS las olas (R-triage hace dedupe cross-ola).

**Razón de secuencializar**: HUGE en paralelo dispara `> 4M tokens` simultáneos y el coste se vuelve impredecible. Secuencial por módulo respeta los caps del bucket (D18) ola a ola.

### Reglas duras

1. **HUGE con <3 módulos** → paralelo igual que MEDIUM/LARGE. El secuencial sólo se activa con módulos múltiples.
2. **R-triage SIEMPRE al final**, una sola pasada con todos los issues acumulados.
3. **Cost estimate** (Wave 4.5) se llama UNA VEZ por ola, no global. Aborts in-flight se aplican por ola.
4. **`/mr-review-resume` retoma la siguiente ola pendiente**, no re-corre las completas.
5. **El marker note se postea SÓLO al final** (tras la última ola + triage + posting), no entre olas. La ausencia indica run no exitoso.
6. **Si una ola aborta** (cost cap, SHA mismatch, auth fail) → toda la run aborta. NO se continúa con las siguientes olas.

---

## Modo `--unattended` (D29 / REQUESTS-001 §A.1)

Cuando se pasa `--unattended` (o el alias `--ci`), el orquestador opera **sin interacción humana**. Los 3 gates humanos se sustituyen por políticas automáticas. Su uso principal es el wrapper standalone en CI/CD, pero también sirve para automatizar runs offline.

### Sustitución de gates

| Gate (modo asistido) | Comportamiento en `--unattended` |
|---|---|
| Paso 5 — Confirmación de equipo | Aceptado automáticamente. La pre-selección del equipo (basada en outputs del pre-pass) se da por buena. El JSON del team plan se persiste como auditoría en `_state/team-accepted-auto.json` |
| Paso 8 — Batch de ambigüedades | Cada `AMBIGUITY_NEEDS_HUMAN` signal se persiste a `_report/ambiguities-skipped.yml` con razón `skipped-in-unattended` y se continúa. Los specialists NO se re-despachan (igual que en modo asistido por ahora). El triage trabaja sin las respuestas y puede flagear `needs-human-decision` en los groups afectados |
| Paso 10 — Selección final | Aceptado automáticamente con filtro: `outcome == publish AND severity ∈ <severity-filter> AND confidence >= <min-confidence>`. Los groups que no pasan el filtro se persisten a `_report/filtered-out-by-unattended-policy.yml` |
| Paso 10.quinquies — Gate de aprobación Jira | Aceptado automáticamente con filtro: `outcome == follow-up AND confidence >= <min-confidence>` (default `high`). Los rechazados quedan en `_report/jira-drafts-skipped-by-policy.yml` |
| Paso 10.quater — Confirmación posting | NO existe gate humano explícito en modo asistido; pero el modo `--unattended` además **no hace preview-then-commit**: postea directamente tras el filtro |

### Cost cap como abort duro (D18)

En modo asistido, el cost cap es un gate (el humano decide). En `--unattended` se vuelve abort:

1. **Pre-flight** (tras Paso 3, bucket calculado): si `estimated_tokens > cap × multiplier` (default 1.5) → abort inmediato con exit code 2 y `_report/cost-cap-aborted.yml`. NO se despachan specialists.
2. **In-flight** (tras cada paso significativo — pre-pass, dispatch, triage, posting): el orquestador re-calcula `tokens_spent` (via marker note acumulado en `_state/orchestrator-state.yml`) y, si `tokens_spent > cap × multiplier` → abort con `_report/cost-cap-aborted.yml`. NO postea marker.

### Filtros configurables

| Flag | Default | Comportamiento |
|---|---|---|
| `--unattended-max-comments=N` | 10 | Hard cap (D34). Si quedan más groups que N tras filtro → se aplica `rankAndCapGroups` |
| `--unattended-min-confidence=<high\|medium>` | `high` | Sólo groups con `confidence >= min` se publican / se hacen Jira |
| `--unattended-severity-filter=<must-fix\|all>` | `must-fix` | `must-fix` → solo must-fix se publica. `all` → must-fix+should-fix+nit |
| `--unattended-cost-cap-multiplier=<N.M>` | `1.5` | Multiplicador del cap por bucket para abort |

Para política más permisiva en runs experimentales: `--unattended-min-confidence=medium --unattended-severity-filter=all --unattended-max-comments=20`.

### Salida

El modo `--unattended` imprime UN bloque JSON estructurado al final (en lugar del Paso 11 conversacional). Útil para parseo en CI:

```json
{
  "ticketId": "WET-4814",
  "mr_iid": 3802,
  "mode": "unattended",
  "bucket": "MEDIUM",
  "total_detected": 12,
  "filtered_by_policy": 3,
  "filtered_by_cap": 2,
  "published": 7,
  "posting_errors": 0,
  "marker_note_id": 998877,
  "jira_drafts_total": 2,
  "jira_created": 2,
  "jira_failed": 0,
  "tokens_spent": 184320,
  "exit_code": 0
}
```

### Códigos de salida en `--unattended`

| Exit code | Significado |
|---|---|
| `0` | Run exitosa (con o sin posts) |
| `1` | Abort por error operacional (auth fail, network, MCP unavailable) |
| `2` | Abort por cost cap excedido (pre-flight o in-flight) |
| `3` | Abort por SHA mismatch durante posting |
| `4` | Abort por crash inesperado |

### Reglas duras

1. **Marker note solo en éxito**: igual que en modo asistido. Abort por cost/SHA/auth ⇒ no marker.
2. **`needs-human-decision` se trata como `reject` en --unattended**: no se publica ni va a Jira, pero se persiste a `_report/needs-human-decision-skipped.yml` para el TL. El humano puede revisar offline y crear los tickets manualmente.
3. **Idempotencia sigue activa**: `gitlab_list_known_issue_hashes` se llama antes de postear igual que en modo asistido.
4. **El SHA pre-flight check** del Paso 10.quater se mantiene activo. En modo unattended, el abort por SHA mismatch es duro (exit 3) sin pedir confirmación.
5. **Confidence se calcula igual** que en modo asistido (D30). El filtro lo aplica el orquestador, no R-triage.

---

## Modo `--estimate` (D35 / REQUESTS-001 §A.8)

Sub-modo que se activa con `--estimate` (sin args). Termina tras el Paso 3 (bucket) sin tocar nada más:

1. Detecta contexto (Paso 1).
2. Pre-pass remoto si modo remote (Paso 2.0): `gitlab_get_mr` + `gitlab_get_diff`.
3. Ejecuta `compute-mr-size.sh` y `stratify-by-module.sh` (Paso 2.2). NO los otros scripts.
4. Calcula bucket (Paso 3).
5. Estima tokens según bucket × specialists activables + R-triage.
6. Imprime JSON y termina:

```json
{
  "ticketId": "WET-4814",
  "mr_iid": 3802,
  "bucket": "MEDIUM",
  "files_changed": 23,
  "lines_changed": 412,
  "specialists_planned": ["R-code-quality", "R-tests", "R-mr-hygiene", "R-di"],
  "estimated_input_tokens": 95000,
  "estimated_output_tokens": 38000,
  "estimated_total_tokens": 133000,
  "estimated_cost_usd": 0.40,
  "cap_for_bucket": 400000,
  "fits_in_cap": true
}
```

Exit codes:

| Exit code | Significado |
|---|---|
| `0` | Estimate OK (bucket ≠ HUGE) |
| `1` | Bucket == HUGE (señal al wrapper standalone para decidir si vale la pena) |

`--estimate` puede combinarse con `--mr <iid>` para apuntar a una MR concreta. NO se combina con `--unattended` (no tiene sentido — `--estimate` no postea).

---

## Modo `--skip-tests` (D35 / REQUESTS-001 §A.7)

Cuando se pasa, R-tests sigue activándose por el patrón habitual y sigue revisando código de tests, PERO el orquestador NO ejecuta `run-tests-summary.sh` en el Paso 6.5. R-tests recibe `null` en lugar del summary de tests.

Útil cuando la pipeline de CI ya corre la suite y queremos evitar duplicar el coste. R-tests ajusta su `confidence` a `medium` automáticamente (no tiene visibilidad del resultado de la suite real).

Combinable con `--unattended`.

---

## Manejo de errores GitLab (modo `remote`)

Matriz canónica de respuestas del wrapper REST y reacción esperada del orquestador:

| Error / Status | Detección | Acción | Persistencia | Marker note |
|---|---|---|---|---|
| **`position invalid`** (4xx en `gitlab_create_discussion` por líneas fuera del diff) | El POST devuelve 4xx con body que menciona `position` | **Retry** el MISMO body sin `position` (comment MR-level). Si vuelve a fallar → siguiente group. | `_report/posted-discussions.yml` con `position_dropped: true`, o `_report/posting-errors.yml` si el segundo intento también falla | Sí (run sigue siendo "exitoso", el contador `posting-errors` lo refleja) |
| **`SHA mismatch`** (head_sha del MR avanza durante la review) | Pre-flight en Paso 10.quater | **Abort completo del posting**. Bodies preparados se preservan para retry manual. | `_report/aborted-posting.yml` con `reason: sha-mismatch-during-review` | **NO** (la ausencia indica run no exitoso) |
| **`rate limit`** (HTTP 429 / 5xx transient) | El client lo detecta automáticamente | **Retry exponencial** transparente (max 3 intentos, base 500ms). Si tras los 3 falla → propaga como `GitlabApiError` y queda como error por group (mismo flujo que `position invalid` segundo fallo). | `_report/posting-errors.yml` si llegó al final sin éxito | Sí, igual que arriba |
| **`auth fail`** (HTTP 401 / 403 no-transient) | El client lanza `GitlabApiError` con `status: 401|403` sin retry | **Abort inmediato de todo el flujo de posting**. El `REVIEW-SUMMARY.md` queda listo para retry manual una vez se arregle el token. | `_report/auth-failure.yml` con `{status, path, timestamp}` | **NO** |
| **`network error`** (ECONNREFUSED, TLS, timeout 30s) | El client retry-ea como transient (5xx-like) y, si agota, lanza `Error` con prefijo `GitLab request failed after N attempts:` | Mismo tratamiento que `rate limit` agotado: queda en `posting-errors.yml`, no aborta el flujo. | `_report/posting-errors.yml` | Sí |
| **`stub: GitLab caído > 10 min`** | Cualquier endpoint del wrapper falla repetidamente | **Abort manual decidido por el operador** (no automático). | manual | NO |

**Reglas duras**:

1. El **marker note se postea SÓLO si el run terminó limpio** (no abort por SHA mismatch, no auth fail, no crash). Errores por group son aceptables — el contador `publishedCount` refleja la realidad.
2. **Nunca borres `_report/discussion-bodies/`** automáticamente tras un abort. Esos bodies son la única forma de retry manual sin re-correr todo el flujo de revisión.
3. **El SHA expected** que se compara en pre-flight es el que se capturó en Paso 2.0 (`$MR_HEAD_SHA`), NO el HEAD local — la branch local puede divergir del MR por diseño.
4. **Token nunca aparece en errores**: el `GitlabApiError` está diseñado para no incluir el header `PRIVATE-TOKEN` en `bodyExcerpt`. Si ves un token en cualquier persistencia → bug, reportar.
