# Schemas — MR-auto-review

> YAML schemas + JSON formats que cruzan la frontera entre agentes y el orquestador. Esta es la **fuente de verdad** del contrato; los prompts en `agents/*.md` referencian estos schemas.

## 1. Issue (producido por specialists)

**Tool**: `mr_write(ticketId, agentName="R-*", kind="issue", content=<yaml>)`.

**Filename**: el server lo compone como `<agentName>/issue-<YYYYMMDD-HHMMSS-mmm>.md`. El body es YAML directo (sin frontmatter — el fichero entero ES el YAML).

### Schema

```yaml
agent: R-<concern>             # match con el agentName del frontmatter
ticketId: <string>             # WET-#### o local-<slug>
generated_at: <ISO 8601 UTC>   # ej: "2026-05-19T14:30:22Z"
mode: local | remote           # opcional; sólo R-mr-hygiene lo emite explícitamente
confidence: high | medium | low # opcional; útil si `issues: []` para señalar ausencia intencional

issues:
  - id: <agent-prefix>-<seq>   # ej: "rcq-001", "rt-cov-003", "rmh-env-002"
    title: <string ≤80 chars>  # persona touch opcional
    file: <relative path from repo root>
    line: <int ≥1>             # número de línea (1-indexed)
    line_end: <int>            # opcional; rango de líneas para context
    severity: must-fix | should-fix | nit
    suggested_outcome: publish | follow-up | reject  # propuesta del specialist; triage decide el final
    excerpt: |
      <código exacto citado; ≤10 líneas>
    problem: |
      <qué está mal; ≤3 frases>
    rule_violated: <KB anchor o rule name>
      # formato: "<kb-file>.md#<anchor>" o ".claude/rules/<file>.md#<anchor>"
      # ejemplo: "code-style.md#typescript-any"
      # ejemplo: "apollo-cache.md#always-set-fetch-policy"
    fix_suggestion: |
      <cómo arreglarlo; opcional si no es obvio>
    additional_positions:        # opcional; mismo bug repetido en otros sitios
      - file: <relative path>
        line: <int>
        line_end: <int>          # opcional
        excerpt: |
          <code>
    # Campos específicos de R-tests para suggestions de tests faltantes:
    suggestion_kind: missing-test    # opcional; sólo R-tests
    test_name: <string>              # opcional; sólo R-tests
    arrange: |                       # opcional; sólo R-tests
      <bullets>
    act: |                            # opcional; sólo R-tests
      <call>
    assert: |                         # opcional; sólo R-tests
      <expects>
```

### Ejemplo completo

```yaml
agent: R-code-quality
ticketId: WET-4814
generated_at: "2026-05-19T14:30:22Z"
confidence: high
issues:
  - id: rcq-001
    title: "as unknown as Type — otra vez"
    file: services/notifications/src/handlers/send-email.ts
    line: 42
    severity: must-fix
    suggested_outcome: publish
    excerpt: |
      const opts = config as unknown as EmailOpts
    problem: |
      `as unknown as Type` enmascara cualquier divergencia real entre el tipo
      origen y el destino. La regla del repo lo prohíbe sin justificación.
    rule_violated: code-style.md#typescript-no-double-cast
    fix_suggestion: |
      Si los tipos NO encajan, define un mapper explícito o cambia la firma
      del consumidor. Si SÍ encajan, sustituye por `as EmailOpts` con un
      comentario `// safe — config conforms to EmailOpts since vN`.
  - id: rcq-002
    title: "Conditional render con &&"
    file: frontend/web/src/pages-spa/home/Home.tsx
    line: 88
    severity: must-fix
    suggested_outcome: publish
    excerpt: |
      {voucherCount && <VoucherBanner count={voucherCount} />}
    problem: |
      `voucherCount && …` renderiza `0` cuando es cero. Debe ser ternario.
    rule_violated: code-style.md#react-conditional-rendering
    fix_suggestion: |
      {voucherCount ? <VoucherBanner count={voucherCount} /> : null}
    additional_positions:
      - file: frontend/web/src/pages-spa/home/HomeFooter.tsx
        line: 14
        excerpt: |
          {bonusCount && <BonusTag count={bonusCount} />}
```

---

## 2. Group (producido por R-triage)

**Tool**: `mr_write(ticketId, agentName="R-triage", kind="report", content=<yaml>)`.

**Filename**: `R-triage/report-<ts>.md` con `subkind: groups` como primer campo del YAML (así el orquestador lo distingue de `review-summary`).

### Schema

```yaml
subkind: groups
ticketId: <string>
generated_at: <ISO 8601 UTC>

counts:
  total_issues_seen: <int>
  total_groups_after_dedupe: <int>
  dedupe_collapsed: <int>
  by_severity:
    must_fix: <int>
    should_fix: <int>
    nit: <int>
  by_outcome:
    publish: <int>
    follow_up: <int>
    needs_human_decision: <int>
    reject: <int>
  by_confidence:                      # añadido en Wave 4.1 (D30)
    high: <int>
    medium: <int>
    low: <int>

groups:
  - id: g-<seq>                      # ej: "g-001"
    title: <string ≤80 chars>
    severity: must-fix | should-fix | nit
    outcome: publish | follow-up | needs-human-decision | reject
    suggestion_completeness: full | partial | requires-context | not-applicable
    confidence: high | medium | low   # D30 — heurístico de 5 criterios
    confidence_reason: <string ≤1 línea>
    sources:                          # ≥1; qué specialists detectaron este group
      - agent: R-<concern>
        original_issue_ids: [<id>, <id>, ...]
    primary_position:
      file: <relative path>
      line: <int>
      line_end: <int>                 # opcional
      excerpt: |
        <code>
    additional_positions:             # 0..N
      - file: <relative path>
        line: <int>
        line_end: <int>               # opcional
        excerpt: |
          <code>
    problem: |
      <fusión sin redundancia de los problems de los specialists>
    rule_violated: <kb anchor>
    fix_suggestion: |
      <consolidated fix; vacío si suggestion_completeness != full>
    triage_notes: |
      <decisiones internas: tie-break, dedupe rationale, position_unverified, etc.>

# Sección opcional al final:
unresolved_signals:                   # opcional; signals que aún no se han tratado
  - agent: R-tests
    signal: KB_GAP
    payload: { pattern: "...", examples: [...] }
```

### Matriz severity × outcome (10 combos válidos sobre 4 outcomes)

| Severity / Outcome | publish | follow-up | needs-human-decision | reject |
|---|---|---|---|---|
| must-fix | block-merge comment | auto-Jira (must address) | comment + decisión humana | **INVALID** |
| should-fix | comment | optional Jira | comment + decisión humana | "no aplica" |
| nit | optional comment | **INVALID** | **INVALID** | descartado |

**Outcome `needs-human-decision`** (añadido v0.1.x): casos donde la corrección requiere una decisión de producto/proceso que el plugin no puede tomar — riesgo runtime con trade-offs, decisiones estructurales (split del MR), ambigüedades cuyo siguiente paso depende del autor. Cuando se usa, **es obligatorio** documentar en `triage_notes` la pregunta concreta que el humano debe responder.

Tie-break: SIEMPRE a la baja, excepto override documentado por shared-knowledge. Forzados:
- must-fix × reject propuesto → should-fix × reject.
- nit × follow-up propuesto → nit × publish.
- nit × needs-human-decision propuesto → nit × publish.

### suggestion_completeness

| Valor | Significado |
|---|---|
| `full` | El `fix_suggestion` es self-contained. GitLab puede renderizar suggestion block aplicable con un clic. |
| `partial` | Hay pista útil pero el dev debe editarla. |
| `requires-context` | El fix depende de info que sólo el dev tiene (semántica del negocio). |
| `not-applicable` | Nit estilístico u opinión; no merece patch. |

---

## 3. Review summary (producido por R-triage)

**Tool**: `mr_write(ticketId, agentName="R-triage", kind="report", content=<markdown>)`.

**Filename**: `R-triage/report-<ts>.md` con frontmatter YAML.

### Estructura

```markdown
---
subkind: review-summary
ticketId: <string>
generated_at: <ISO 8601 UTC>
groups_file: <fileId del groups-<ts>.md correspondiente>
---

# Review Summary — <ticketId>

<Párrafo apertura ≤2 frases, voz Anselmo>

## Counts

- Total groups: **<N>**
- 🔴 must-fix: **<N>** (publish: N, follow-up: N)
- 🟠 should-fix: **<N>** (publish: N, follow-up: N, reject: N)
- 🟡 nit: **<N>** (publish: N, reject: N)

## Groups

| # | Severity | Outcome | Title | Location |
|---|----------|---------|-------|----------|
| g-001 | 🔴 must-fix | publish | <title> | <file:line> (+N más) |
| ...   | ...        | ...      | ...     | ...               |

## Detalle por grupo

### g-001 — <title>
- **Severidad**: 🔴 must-fix
- **Outcome propuesto**: publish (block merge)
- **Fix**: full
- **Fuentes**: R-<concern> (<issue-id>), R-<otro> (<issue-id>)
- **Primary**: `<file>:<line>`
- **Repite en**: `<file>:<line>`, ...
- **Problema**:
  > <párrafo>
- **Sugerencia**:
  ```<lang>
  <code>
  ```

### g-002 — ...

## Signals

<si hay unresolved signals: lista breve, una línea por signal>

## Next steps

<gate de selección final>
```

---

## 4. Signal (producido por cualquier agent)

**Tool**: `mr_signal(ticketId, agentName, signal, payload)`.

**Persistencia**: append a `_signals/log.jsonl` (una línea JSON por signal).

### Schema (línea del jsonl)

```json
{
  "id": "<uuid>",
  "timestamp": "<ISO 8601 UTC>",
  "agentName": "R-<concern>",
  "signal": "SCOPE_EXPANSION_REQUEST | AMBIGUITY_NEEDS_HUMAN | BLOCKER_ESCALATION | KB_GAP",
  "payload": { /* arbitrary JSON */ }
}
```

### Tipos válidos

| Signal | Cuándo | Payload típico |
|---|---|---|
| `SCOPE_EXPANSION_REQUEST` | El agent detecta que necesitaría revisar ficheros fuera del scope que le pasó el orquestador | `{ files: [...], reason: "..." }` |
| `AMBIGUITY_NEEDS_HUMAN` | El agent no puede decidir entre interpretaciones del cambio sin input humano | `{ context: "...", options: [...] }` |
| `BLOCKER_ESCALATION` | Algo impide al agent completar (workspace corrupto, ticketId inválido, fichero clave no existe) | `{ reason: "...", details: {...} }` |
| `KB_GAP` | El agent encontró un patrón recurrente que el KB no cubre | `{ pattern: "...", examples: [{file, line, excerpt}, ...] }` |

---

## 5. Context (producido por orquestador)

**Tool**: `mr_write(ticketId, agentName="_context", kind="context", content=<...>)`.

`_context` es un agentName especial que el server interpreta como "no es un reviewer; deja en `_context/`".

### Tipos de fichero de contexto

| Filename pattern | Contenido | Formato |
|---|---|---|
| `_context/context-<ts>.md` con `shared-knowledge` en title | Resumen del scope + ticket + módulos tocados | Markdown |
| `_context/context-<ts>.md` con `mr-metadata` en title | JSON estructurado (ver abajo) | JSON dentro de fences |
| `_context/context-<ts>.md` (otros) | Respuestas a ambigüedades | Markdown libre con front-matter `signal_id:` y `agent:` |

### `mr-metadata.json` schema

```json
{
  "ticketId": "<string>",
  "mode": "local" | "remote",
  "branch": "<string>",
  "baseRef": "<string>",
  "bucket": "TINY" | "SMALL" | "MEDIUM" | "LARGE" | "HUGE",
  "files": ["<relative path>", "..."],
  "stats": {
    "files_count": <int>,
    "lines_added": <int>,
    "lines_deleted": <int>
  },
  "commits": [
    { "sha": "<7-char>", "subject": "<string>", "author": "<string>" }
  ],
  "description": "<string>" | null,
  "jiraIssue": {                       // opcional; null en local mode sin ticket Jira
    "key": "<string>",
    "summary": "<string>",
    "description": "<string>"
  }
}
```

### `shared-knowledge.md` plantilla

```markdown
---
subkind: shared-knowledge
ticketId: <string>
---

# Shared knowledge — <ticketId>

## Scope
<1 párrafo del scope del MR>

## Módulos tocados
- packages/<...>
- services/<...>
- ...

## Ticket Jira (si aplica)
<resumen del ticket + extractos relevantes>

## Notas operativas
<cualquier nota que el orquestador quiera dejar a todos los reviewers>
```

---

## 6. Workspace layout (recap)

```
.dev/MR-auto-review/<ticketId>/
├── _context/
│   ├── context-<ts>.md           # shared-knowledge
│   ├── context-<ts>.md           # mr-metadata (JSON dentro)
│   └── context-<ts>.md           # respuestas a ambigüedades (opcional)
├── _signals/
│   └── log.jsonl                 # append-only
├── R-code-quality/
│   └── issue-<ts>.md             # YAML body
├── R-tests/
│   └── issue-<ts>.md
├── R-mr-hygiene/
│   └── issue-<ts>.md
└── R-triage/
    ├── report-<ts>.md            # subkind: groups (YAML)
    └── report-<ts>.md            # subkind: review-summary (md)
```

Todo dentro de este directorio es **regenerable**. Está en `.gitignore`. El usuario puede borrar la carpeta sin perder nada del repo.

---

## Compatibilidad y versionado

Estos schemas son `v0.1` — pueden cambiar entre waves. Cuando un schema cambie:

1. Bump del `version` en `.claude-plugin/plugin.json`.
2. Sección "Breaking changes" al final de este doc.
3. Migración de workspaces existentes documentada (sólo si el usuario tiene reviews en curso).

### Breaking changes

(ninguno aún — v0.1 es la primera versión)
