# Architecture — MR-auto-review plugin

> Documenta el flujo end-to-end del plugin, las capas que lo componen, y las decisiones de diseño (D1–D35). Refleja el estado tras Wave 3.G.

## Visión de alto nivel

```
                       +--------------------------------+
                       |   Slash command /mr-review     |
                       |   (orquestador en main agent)  |
                       +---------------+----------------+
                                       |
   Paso 1 ---------------------------- v ---------------------------- Paso 11
   Detectar contexto (modo local/remoto, branch, MR autodetect, ticketId)

   Paso 2.0 (sólo remote)
   gitlab_get_mr + gitlab_get_diff + gitlab_list_discussions
   → escribe _context/mr-metadata.json (SHAs, autor, reviewers, descripción)
   → SHA mismatch check inicial

   Paso 2.1–2.3
   Pre-pass scripts library (compute-mr-size, stratify-by-module,
   detect-mongo-pipelines, detect-di-usage, detect-secrets-touch,
   detect-env-vars-changes, detect-react-lazy). Ad-hoc scripts pasan por R-script-auditor.

   Paso 3
   Bucket de tamaño (TINY/SMALL/MEDIUM/LARGE/HUGE).

   Paso 4
   Selección de specialists basada en outputs del pre-pass.
   Catálogo: 23 agent types (R-third-party-docs es el único con WebFetch+WebSearch).

   Paso 4.1–4.2
   shared-knowledge.md + mr-metadata.json (en local desde cero; en remote completa
   placeholders del Paso 2.0).

   Paso 4.5
   R-custom (opcional, bajo demanda).

   Paso 5
   Gate humano: confirmación de equipo. En modo remote muestra autor/reviewers/SHAs.

   Paso 6
   Dispatch paralelo de specialists. Subagents leen via MCP + Read/Grep/Glob.
   Persistencia: issues-*.md por agent + _signals/log.jsonl.

   Paso 6.5
   Run-tests-summary (si R-tests activo y bucket ≥ SMALL).

   Paso 7
   Parse signals: KB_GAP → reporta; BLOCKER → para; SCOPE → R-custom expandido;
   AMBIGUITY → Paso 8.

   Paso 8
   Batch de ambigüedades (humano resuelve).

   Paso 9
   R-triage (opus): dedupe + agrupación + matriz severity × outcome × confidence.

   Paso 10
   Gate humano: selección final.

   Paso 10.bis (sólo remote)
   Composición de bodies via gitlab_compose_discussion_body + persona
   en prefijo. Idempotencia via gitlab_list_known_issue_hashes.

   Paso 10.ter (sólo remote)
   Hard cap configurable (default 10). Orden: severity DESC, confidence DESC,
   detectorCount DESC. Sobre cap → not-published.yml.

   Paso 10.quater (sólo remote)
   Pre-flight SHA re-check → si difiere, aborta + aborted-posting.yml + NO marker.
   Bucle de posting via gitlab_create_discussion (con retry sin position si
   GitLab rechaza). Marker note al final via gitlab_create_mr_note.

   Paso 10.quinquies
   Follow-up tickets Jira via jira_compose_followup_draft + gate humano +
   mcp__claude_ai_Atlassian__createJiraIssue. Persistencia jira-created.yml /
   jira-failed.yml. Label to-be-reviewed-sprint para el TL.

   Paso 11
   Output local (stdout + paths a workspace). En remote añade contadores
   de posting + Jira.
```

Comandos auxiliares (Wave 3.G):

- `/mr-review-status` — read-only: estado del workspace activo.
- `/mr-review-resume` — retoma desde el último checkpoint en `_state/orchestrator-state.yml`.
- `/mr-review-undo` — borra notas registradas en `posted-discussions.yml` via `gitlab_delete_mr_note`. Gate humano + verificación de autoría obligatorios.

## Capas

### 1. Manifest layer (`.claude-plugin/plugin.json`)

Entry point del plugin para Claude Code. Declara:
- `name`, `version`, `description`, `license`.
- `mcpServers`: path al config JSON del MCP server bundled.
- Auto-discovery activado para `agents/<name>.md` y `commands/<name>.md`.

Wave 4 añadirá `hooks` con `PreToolUse` para la tercera capa del sandbox.

### 2. Orchestration layer (`commands/mr-review.md`)

El slash command no es un subagent — es un guion ejecutado por el **main agent**. Responsabilidades:

- Detectar contexto (modo local vs remoto, ticketId, branch, autodetect MR via `gitlab_find_mr_for_branch`).
- Pre-pass remoto (cuando aplica): `gitlab_get_mr` + `gitlab_get_diff` + `gitlab_list_discussions`.
- Calcular bucket + seleccionar equipo según file patterns + outputs de pre-pass scripts.
- Gate humano antes de gastar tokens.
- Despacho paralelo de specialists vía `Agent` tool.
- Procesar signals.
- Despacho de R-triage.
- Gate final + composición de bodies (modo remote) + dedup + hard cap + posting.
- Marker note + follow-up tickets Jira.

### 3. Reviewer layer (`agents/R-*.md`)

23 subagent types tras Wave 3.E.b. Cada uno:

- **Frontmatter YAML**: `name`, `description`, `model`, `tools`, `disallowedTools`, `effort`, `maxTurns`.
- **Body**: `## Persona`, `## Mission`, `## Inputs`, `## Reglas de revisión`, `## Output protocol`, `## Hard rules`.

Modelos:
- `sonnet` por defecto (specialists).
- `opus` para `R-triage` (razonamiento complejo de dedupe + agrupación).
- `haiku` para `R-script-auditor` (one-shot, verdict rápido).

Toolset:
- Specialists típicos: `Read`, `Grep`, `Glob` + 5 tools del workspace MCP (`mr_*`).
- `R-triage`: SOLO MCP (no Read directo).
- **`R-third-party-docs`** (Demetrio el Documentao): ÚNICO specialist con `WebFetch`+`WebSearch` (fuente de verdad: doc oficial del vendor en runtime).
- Todos: `disallowedTools: [Edit, Write, NotebookEdit, Bash]` (excepto Demetrio que sí permite Web*).

Ver `AGENT-CATALOG.md` para el roster completo + personas.

### 4. MCP layer (`mcp-server/`)

Server propio del plugin (Node + TypeScript + `@modelcontextprotocol/sdk` + zod). Expone **17 tools** tras Wave 3.G:

#### Workspace tools (5 — Wave 1)

| Tool | Escribe | Lee | Notas |
|---|---|---|---|
| `mr_write(ticketId, agentName, kind, content)` | ✓ | — | Crea ficheros con timestamp; path composition centralizada |
| `mr_read(ticketId, fileId)` | — | ✓ | Lee dentro del workspace del ticket |
| `mr_list(ticketId, filters?)` | — | ✓ | Metadata-only listing |
| `mr_overwrite(ticketId, fileId, content)` | ✓ | — | Atomic overwrite; requiere fichero existente |
| `mr_signal(ticketId, agentName, signal, payload)` | ✓ (log.jsonl) | — | 4 signals válidos |

#### GitLab tools (11 — Wave 3)

| Tool | HTTP | Notas |
|---|---|---|
| `gitlab_get_mr(iid)` | GET | Metadata + diff_refs (base/head/start SHA) |
| `gitlab_get_diff(iid, ticketId?)` | GET + disk | `/changes`; per-file summary + escribe unified diff a fichero (workspace si `ticketId`; tempdir si no). Devuelve `unified_diff_path`, NO el contenido. |
| `gitlab_list_discussions(iid)` | GET | Paginado, hasta 100/page |
| `gitlab_list_notes(iid, order?)` | GET | Paginado, ordenable |
| `gitlab_create_discussion(iid, body, position?)` | POST | Inline (con position) o MR-level (sin) |
| `gitlab_resolve_discussion(iid, discussionId, resolved?)` | PUT | Resolver/re-abrir |
| `gitlab_find_mr_for_branch(branch)` | GET | Para autodetect remote mode |
| `gitlab_compose_discussion_body(...)` | (pure) | Chrome bot + sign-off + issue-hash determinista |
| `gitlab_list_known_issue_hashes(iid)` | GET | Indexa hashes ya publicados (idempotencia) |
| `gitlab_create_mr_note(iid, body)` | POST | Nota stand-alone (marker run-completed) |
| `gitlab_delete_mr_note(iid, noteId)` | DELETE | Para /mr-review-undo |

#### Jira tools (1 — Wave 3.F)

| Tool | Notas |
|---|---|
| `jira_compose_followup_draft(...)` | Pure; compone `{summary, description, labels, priority}`. La creación real va via `mcp__claude_ai_Atlassian__createJiraIssue` (MCP externo) |

#### Utils internos (no son tools — librería interna)

- `src/util/issue-hash.ts`: `computeIssueHash` + `extractIssueHashes`.
- `src/util/marker-note.ts`: `composeMarkerNote` + `parseMarkerNote`.
- `src/util/ranked-publish.ts`: `rankAndCapGroups`.
- `src/util/jira-draft.ts`: `composeJiraFollowupDraft`.

#### Auth + Client

- `src/tools/gitlab/auth.ts`: resuelve token desde `GITLAB_TOKEN` env (preferente) o desde `git remote get-url origin` (fallback). Host + project path siempre desde el remote.
- `src/tools/gitlab/client.ts`: fetch wrapper con `PRIVATE-TOKEN` header, retry exponencial sobre 5xx + 429 (max 3, base 500ms), timeout 30s, `GitlabApiError` sin token en mensajes.

### 5. KB layer (`_kb/<concern>.md`)

Knowledge base destilado del análisis empírico de MRs históricos (Wave 0). 20 ficheros + stubs en Wave 2 (`functional-completeness`, `regressions`) + Wave 3.E.b (`third-party-docs`). Cada specialist lee SU propio `_kb/<concern>.md` antes de revisar.

Excepción: `R-third-party-docs` usa el KB para heurísticas iniciales pero su fuente de verdad es la doc oficial del vendor (via `WebFetch`).

Versionado en `_kb/_index.md`. Regenerable vía `_methodology/RUN-ANALYSIS.md`.

### 6. Workspace layer (`.dev/MR-auto-review/<ticketId>/`)

NO commiteado (gitignored). Estructura por ticket tras Wave 3:

```
.dev/MR-auto-review/<ticketId>/
├── _context/
│   ├── shared-knowledge.md
│   ├── mr-metadata.json
│   ├── existing-discussions.json      # sólo modo remote
│   └── context-<ts>.md                # respuestas a ambigüedades
├── _signals/
│   └── log.jsonl                      # append-only de signals
├── _state/                            # Wave 4
│   └── orchestrator-state.yml         # checkpoints para /mr-review-resume
├── _scripts/                          # ad-hoc scripts auditados
│   └── <script-name>.sh
├── _context/scripts-output/           # outputs JSON de scripts library + ad-hoc
│   └── <script-id>.json
├── R-code-quality/
│   └── issue-<ts>.md
├── R-tests/
│   └── issue-<ts>.md
├── R-third-party-docs/
│   └── issue-<ts>.md
... (un dir por agent que escribió)
├── R-triage/
│   ├── report-<ts1>.md                # subkind: groups
│   └── report-<ts2>.md                # subkind: review-summary
└── _report/                           # outputs visibles al usuario
    ├── discussion-bodies/
    │   └── <groupId>.yml              # body + issueHash listos para postear
    ├── posted-discussions.yml         # registro tras posting
    ├── posted-discussions-plan.yml    # antes del posting (hard cap aplicado)
    ├── not-published.yml              # over-cap-N
    ├── posting-errors.yml             # errores graciosos
    ├── aborted-posting.yml            # SHA mismatch, auth fail
    ├── auth-failure.yml               # detalle de auth fail
    ├── marker-note.yml                # noteId del marker run-completed
    ├── skipped-duplicates.yml         # issue-hash ya en MR
    ├── maybe-removed-previously.yml   # hashes ausentes que el bot recuerda haber posteado
    ├── jira-followups.yml             # drafts antes de approval
    ├── jira-created.yml               # tickets creados
    ├── jira-failed.yml                # MCP Atlassian fail
    ├── undo-log.yml                   # registro de /mr-review-undo
    └── undo-skipped.yml               # notas no borradas por autoría
```

## Sandbox de 3 capas (D11)

1. **Toolset declarado**: cada agent.md restringe explícitamente lo que puede llamar (`tools` + `disallowedTools` en frontmatter).
2. **Validación server-side**: el MCP server rechaza paths fuera del workspace y agentNames/kinds inválidos. **Esta capa es la crítica**.
3. **Hook `PreToolUse`** (Wave 4): bundled en el plugin, vuelve a validar cualquier acción que escape el patrón esperado.

Capas 1+2 activas desde Wave 1; capa 3 se añade en Wave 4.

## Modos

| Modo | Cuándo | Wave |
|---|---|---|
| **local** | `--local` o no hay MR remota para la branch | Wave 1 |
| **remote** | `--mr <iid>` o autodetect (gitlab_find_mr_for_branch) | Wave 3.B |
| **remote read-only** | Wave 3.B antes de 3.D — sin posting | (transitorio) |
| **unattended** (CI) | `--unattended` (alias `--ci`) | Wave 4 |
| **estimate** | `--estimate` (sub-modo: pre-pass + bucket + exit) | Wave 4 |
| **resume** | `/mr-review-resume` (companion command) | Wave 3.G + Wave 4 (checkpoints) |

## Cost caps (D18)

Cada bucket tiene un cap de tokens. Wave 1 los documenta; Wave 4 los enforce:

| Bucket | Cap input | Cap output | Cap total |
|---|---|---|---|
| TINY | 10K | 5K | 30K |
| SMALL | 30K | 15K | 100K |
| MEDIUM | 100K | 40K | 400K |
| LARGE | 300K | 100K | 1.5M |
| HUGE | 1M | 300K | 4M+ |

Gate humano automático si excede 150% del cap. En `--unattended` (D29): abort duro.

**HUGE siempre se revisa** (nunca rechaza por tamaño); con ≥3 módulos, ejecución **secuencial por módulo** (Wave 4) con human re-approval entre olas (skipado en --unattended).

## Idempotencia (D32)

Spec: WET-4814 D31+D32 (REQUESTS-001 §A.3+§A.4, decisión E.2).

- Cada body posteado lleva un `issue-hash` visible en el sign-off técnico (no HTML-commented).
- El hash es SHA-256 trunc 16 sobre `file_path canonicalizado + line + severity + body normalizado + agent_id`. La persona NO entra en el hash (cosmética).
- Entre re-runs: orquestador llama `gitlab_list_known_issue_hashes`, indexa los hashes ya publicados, skipea los duplicados.
- Discussion previa `resolved: true` → también skipea.

## Marker note (D33)

Tras un run exitoso (no abort), el orquestador postea UN note (no discussion) con formato fijo + línea `*marker: run-completed*` visible. El parser `parseMarkerNote` (en `src/util/`) lee el note más reciente del bot y detecta la última pasada exitosa. Base para re-review incremental (Wave 6, B.1).

## Decisiones de diseño relevantes

Las 35 decisiones D1–D35 viven en `.claude/plans/MR-auto-review/WET-4814-plan.md`. Las más relevantes para entender la arquitectura:

- **D1**: Plugin (no skill plano).
- **D2**: 23 agent types γ-híbrido.
- **D5**: Severity × outcome ortogonal — matriz de 7 combos válidos.
- **D11**: Sandbox 3 capas.
- **D14**: KB versionado + corpus crudo gitignored.
- **D17**: GitLab wrapper propio (sin MCP comunitario).
- **D20**: preview-then-commit por defecto.
- **D25**: Personas con nombre + voz por agente.
- **D29**: Modo `--unattended` para CI.
- **D30**: confidence en R-triage.
- **D31–D34**: Chrome bot visible, issue-hash idempotencia, marker note, hard cap.
- **D35**: `--skip-tests` y `--estimate` para el wrapper standalone.

## Roadmap de waves

Ver `WET-4814-plan.md` para el detalle. Estado tras Wave 3.G:

- **Wave 0** (completed v1): KB empírico (39 MRs, 1024 technical comments, 6 patterns).
- **Wave 1** (completed): esqueleto + MVP local + 4 agentes core.
- **Wave 2** (completed): catálogo completo (22 agents) + scripts library + R-script-auditor.
- **Wave 3** (en curso, 7/8 sub-bloques cerrados):
  - 3.A: GitLab REST wrapper ✓
  - 3.B: Modo remoto en orquestador (read-only) ✓
  - 3.C: Chrome bot + idempotencia issue-hash ✓
  - 3.D: Posting + hard cap + marker note ✓
  - 3.E: Manejo de errores ✓
  - 3.E.b: R-third-party-docs (Demetrio el Documentao) ✓
  - 3.F: Jira follow-ups ✓
  - 3.G: Slash commands extra (status/resume/undo) ✓
  - 3.H: Docs (este archivo + REMOTE-MODE.md + JIRA-INTEGRATION.md) — en curso
- **Wave 4** (pending): hardening — `--unattended`, confidence, cost gates, `--skip-tests`, `--estimate`, checkpoint-writes, PreToolUse hook, modo secuencial HUGE.
- **Wave 5** (pending): cutover — validación con 6 MRs reales + retiro de `omar-review`.
- **Wave 6** (backlog): mejoras post-standalone (B.1–B.5 de REQUESTS-001).
