# Remote mode — `/mr-review` against an open GitLab MR

> Cómo el plugin opera contra una MR abierta de GitLab: autodetect, lectura del MR, posting de comments line-level, idempotencia entre re-runs, marker run-completed, y manejo de errores.

## Cuándo se entra en modo remote

El orquestador `/mr-review` decide el modo en el **Paso 1**:

| Flag | Resultado |
|---|---|
| `--local` | Fuerza modo local (no toca GitLab) |
| `--mr <iid>` | Modo remote contra el IID indicado |
| (ningún flag) | Llama `gitlab_find_mr_for_branch(<branch>)`:<br>• 0 matches → local<br>• 1 match → remote contra ese IID<br>• ≥2 matches → presenta la lista al humano |

El branch local NO tiene que estar a la última con el MR — la comparación se hace contra el `head_sha` que GitLab reporta.

## Token y autenticación

El plugin lee el token GitLab desde, por orden:

1. `process.env.GITLAB_TOKEN` — preferente. Útil para un PAT dedicado (Wetaca: `Vixx-MR-auto-reviewer`, scope `api`).
2. Token embebido en `git remote get-url origin` (formato `https://oauth2:<token>@…`).

El host y project path se derivan siempre del remote (incluso cuando el token viene de env). Esto fija el proyecto al que apunta el wrapper en el repo actual.

El token **nunca** se persiste en logs ni en errores — `GitlabApiError` está diseñado para excluir headers y body sospechosos. Si ves un token en cualquier persistencia → bug, reportar.

## Pre-pass remoto (Paso 2.0)

Antes de generar el patch local, el orquestador hace 3 llamadas:

1. `gitlab_get_mr({iid})` → guarda `description`, `title`, `author`, `reviewers`, `base_sha`, `head_sha`, `start_sha`, `web_url`, `target_branch`.
2. `gitlab_get_diff({iid, ticketId})` → `unified_diff_path` (path absoluto al fichero ya escrito por el MCP en `<workspace>/_context/diff-iid<N>.patch` o tempdir; los scripts library leen de ahí) + `unified_diff_bytes` + `files` con `diff_preview` por fichero (no se devuelve el contenido completo del diff a la LLM).
3. `gitlab_list_discussions({iid})` → persiste a `_context/existing-discussions.json` (sirve a 10.bis para idempotencia y al humano para ver discussion previo).

Estos datos se persisten en `_context/mr-metadata.json`:

```json
{
  "ticketId": "WET-4814",
  "mode": "remote",
  "mrIid": 3802,
  "branch": "feature/WET-4814--mr-auto-review-plugin",
  "baseRef": "master",
  "mrUrl": "https://gitlab.com/.../merge_requests/3802",
  "title": "...",
  "description": "...",
  "author": { "username": "...", "name": "..." },
  "reviewers": [ { "username": "...", "name": "..." } ],
  "sha": {
    "base":  "72b85b8e...",
    "head":  "69ab9e01...",
    "start": "72b85b8e..."
  },
  "localShaMatch": true,
  "existingDiscussions": 4,
  "bucket": null,
  "files": [],
  "stats": null,
  "scripts_output_index": []
}
```

Tras el resto del pre-pass, los campos `bucket`/`files`/`stats`/`scripts_output_index` se completan via `mr_overwrite`.

**SHA mismatch check inicial** (Paso 2.0, paso 4): si `localShaMatch == false` el orquestador avisa al humano antes de seguir. El humano puede continuar; la revisión usará el diff REMOTO.

## Composición de bodies (Paso 10.bis)

Para cada group con `outcome: publish`, el orquestador llama:

```
gitlab_compose_discussion_body({
  agentName, agentPersona?, severity, groupId,
  bodyMarkdown, detectors, confidence, filePath, lineNumber
})
→ { body, issueHash }
```

El `body` resultante tiene 3 elementos canónicos visibles (decisión E.2 — sin HTML comments):

```markdown
🤖 **MR-auto-review** · Filomeno el Maquinista (R-gitlab-ci) · must-fix

<bodyMarkdown sustantivo del issue>

---
*Group: G-007 · Detected by: R-gitlab-ci, R-infra-protect · Confidence: high · Severity: must-fix · issue-hash: 8a3119a85c15b3e0*

> Si este comentario no es útil, reacciona con 👎 — nos ayuda a calibrar.
```

El `issueHash` es determinista (sha256-trunc-16 sobre `file_path canonicalizado + line + severity + body normalizado + agent_id`) y NO incluye la persona — re-runs con misma issue producen el mismo hash.

## Idempotencia entre re-runs (Paso 10.bis paso 3)

Antes de postear, el orquestador llama `gitlab_list_known_issue_hashes({iid})` y obtiene un mapa `hash → {discussionId, resolved, firstNoteId}`. Para cada group preparado:

- Si `issueHash` está en el mapa → skip y log a `_report/skipped-duplicates.yml`.
- Si el matching está `resolved: true` → también skipea (la convención es "ya conocido y resuelto").
- Si NO está en el mapa pero el bot recuerda haberlo posteado en una run anterior (no implementado todavía — requiere persistencia cross-run) → log a `maybe-removed-previously.yml`.

Esto evita inundar al autor con re-posts cuando el MR se relanza tras un push.

## Hard cap (Paso 10.ter)

Default cap = 10 comments por MR. Configurable via `--unattended-max-comments=N` (Wave 4).

El orquestador aplica `rankAndCapGroups`:
- Orden: `severity DESC` > `confidence DESC` > `detectorCount DESC`.
- Stable sort (tie-break por orden de entrada).
- Top-N a `_report/posted-discussions-plan.yml`.
- Resto a `_report/not-published.yml` con `reason: over-cap-N`.

## Posting + retry semantics (Paso 10.quater)

**Pre-flight SHA re-check**: el orquestador vuelve a llamar `gitlab_get_mr` ANTES del bucle y compara `head_sha` con el valor del Paso 2.0. Si difiere → aborta el posting completo (alguien pusheó al MR durante la review).

Bucle:

1. Para cada group del `posted-discussions-plan`:
   - `gitlab_create_discussion({iid, body, position})` con `position` = `{base_sha, start_sha, head_sha, position_type: 'text', new_path, new_line}`.
   - Si GitLab rechaza por position inválida (líneas fuera del diff) → retry SIN `position` (queda como MR-level comment). Marca `position_dropped: true`.
   - Persiste `{groupId, discussionId, firstNoteId, issueHash}` en `_report/posted-discussions.yml`.
2. Si tras los 2 intentos sigue fallando → log a `_report/posting-errors.yml`. NO aborta el flujo entero.
3. Tras el bucle, postea el marker note (ver siguiente sección).

El `gitlab_create_discussion` ya lleva retry exponencial sobre 5xx + 429 (max 3, base 500ms) en el client del wrapper — esto es transparente al orquestador.

## Marker run-completed (Paso 10.quater final, D33)

Tras un run exitoso, el orquestador construye el body con `composeMarkerNote`:

```
🤖 MR-auto-review · run completed
SHA reviewed: 69ab9e01ac67abc1
Timestamp: 2026-05-20T15:30:00Z
Comments published: 7 (of 12 detected; 3 filtered by policy; 2 filtered by cap)
Tokens spent: 184320
Bucket: MEDIUM
Plugin version: 0.3.0

*marker: run-completed*
```

Y lo postea via `gitlab_create_mr_note({iid, body})`. El `noteId` se persiste en `_report/marker-note.yml`.

**Reglas duras**:

- Marker sólo en éxito (no si abortó por SHA mismatch, auth fail, o crash).
- La ausencia del marker = run no exitoso (criterio del wrapper standalone para re-review).
- Parser `parseMarkerNote(body)` reconoce el marker con regex tolerante a italics/spacing.

## Matriz de errores

| Escenario | Acción | Persiste a | Marker? |
|---|---|---|---|
| `position invalid` (4xx) | Retry sin position; si vuelve a fallar, skip | `posted-discussions.yml` con `position_dropped: true` o `posting-errors.yml` | Sí |
| SHA mismatch (pre-flight) | Abort completo del posting | `aborted-posting.yml` | NO |
| Rate limit (429) / transient 5xx | Retry exponencial transparente (3 intentos) | `posting-errors.yml` si falla tras retries | Sí |
| Auth fail (401/403) | Abort inmediato | `auth-failure.yml` | NO |
| Network error / timeout | Mismo trato que rate limit | `posting-errors.yml` si agota | Sí |

## Undo (`/mr-review-undo`)

Para revertir los posts de la última run:

1. Lee `_report/posted-discussions.yml`.
2. Verifica autoría con `gitlab_list_notes` (compara `author.username` con el token user).
3. Gate humano: presenta lista numerada, espera selección.
4. Para cada nota aprobada: `gitlab_delete_mr_note({iid, noteId})`.
5. Persiste `_report/undo-log.yml`.

**Nunca borra notas que NO estén en el log** — aunque el author matchee, si no la registramos nosotros, no es nuestra. Esto protege comments humanos posteados con la misma cuenta de servicio.

## Configuración

Variables de entorno relevantes (todas opcionales salvo `GITLAB_TOKEN` en modo dedicated):

| Var | Default | Notas |
|---|---|---|
| `GITLAB_TOKEN` | (token del remote) | PAT con scope `api`. Recomendado: PAT dedicado al plugin |
| `GITLAB_INTEGRATION` | (off) | Cuando `=1` habilita el integration test opt-in del MCP server |
| `GITLAB_TEST_IID` | (off) | IID del MR contra el que correr el integration test |

Ver `mcp-server/.env.example` para una plantilla.

## Smoke test rápido

```fish
# Desde mcp-server/, usando token de .env
npm run test:integration
# → crea + resuelve una probe discussion en la MR indicada
```

El probe deja un comentario `🤖 MR-auto-review · integration-probe`. Limpio de borrar manualmente o vía `/mr-review-undo` (si la run quedó registrada).
