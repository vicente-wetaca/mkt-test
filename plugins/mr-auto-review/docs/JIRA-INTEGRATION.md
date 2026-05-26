# Jira integration — follow-up tickets

> Cómo el plugin crea tickets Jira para los groups del triage con `outcome: follow-up`. Spec: Wave 3.F + D5 (severity × outcome matrix).

## Cuándo se generan follow-ups

Tras el triage (Paso 9), cada group recibe un `outcome` (publish | follow-up | reject | needs-human-decision). Los **follow-up** son:

- Issues legítimos PERO fuera del scope del MR actual.
- Tech-debt acumulado que merece ticket propio.
- Patrones recurrentes que deberían arreglarse de forma consistente (ej. "5 ocurrencias del mismo antipattern en otros módulos").

En el Paso 10 (gate humano) el usuario puede:
- Cambiar `outcome: publish` → `follow-up` (decidir que no entra en este MR).
- Cambiar `outcome: follow-up` → `reject` (decidir que no merece ticket).

Tras la selección final, los groups marcados `follow-up` entran al pipeline Jira (Paso 10.quinquies).

## Pre-condiciones

| Condición | Comportamiento |
|---|---|
| Cualquier modo (local o remote) | Acepta follow-ups |
| `ticketId` matchea `WET-\d+` | Pipeline Jira se ejecuta |
| `ticketId` empieza con `local-*` | Pipeline Jira **NO** se ejecuta automáticamente (el usuario puede invocar `/mr-review --include-jira` para forzar) |
| MCP `mcp__claude_ai_Atlassian__createJiraIssue` disponible | Crea tickets |
| MCP no disponible | Persiste drafts a `_report/jira-followups.yml` para revisión manual |

## Flujo

### 1. Composición de drafts

Para cada group con `outcome: follow-up`, el orquestador llama:

```
mcp__plugin_mr-auto-review_mr-auto-review__jira_compose_followup_draft({
  groupId, summary, mrIid, mrUrl, ticketId,
  occurrences: [{filePath, lineNumber, excerpt?}, ...],
  suggestedFix: <WHY/FIX/ALTERNATIVA opcional>,
  severity, confidence,
  extraLabels: [<módulos tocados>, <ticketId>]
})
```

Devuelve `{summary, description, labels, priority}`. La función es **pura** (no llama Jira) — sólo compone el payload.

### 2. Persistencia previa al gate

Los drafts se persisten TODOS juntos en `_report/jira-followups.yml`:

```yaml
followups:
  - group_id: G-007
    draft:
      summary: "Refactor: eliminate `as unknown as` casts in payments service"
      description: |
        Detected during automated review of MR !3762 (WET-4715).

        **Severity**: should-fix  |  **Confidence**: high  |  **Detected occurrences**: 3

        **Occurrences**
        - services/payments/handlers/place-order.ts:42
        - services/payments/handlers/refund.ts:88
        - services/payments/utils/normalize.ts:120

        **Suggested fix**
        ...
        ---
        Origin: MR https://gitlab.com/.../merge_requests/3762 / Group G-007

        > This ticket was drafted by MR-auto-review and approved by a human before creation.
        > Please move it to the "To be reviewed" sprint manually (label `to-be-reviewed-sprint`).
      labels: [mr-auto-review, tech-debt, to-be-reviewed-sprint, payments, WET-4715]
      priority: medium
    approved: null
    created: null
```

### 3. Gate humano

El orquestador presenta la lista al usuario:

```
Follow-up tickets propuestos (2):

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

El usuario aprueba en batch o por índices. La elección se aplica al fichero (`approved: true|false` por entrada).

### 4. Creación

Para cada draft con `approved: true`, el orquestador llama:

```
mcp__claude_ai_Atlassian__createJiraIssue({
  projectKey: "WET",
  summary: <draft.summary>,
  description: <draft.description>,
  issueType: "Task",
  labels: <draft.labels>,
  priority: <draft.priority>
})
```

El resultado se persiste en `_report/jira-created.yml`:

```yaml
created:
  - group_id: G-007
    jira_key: WET-5012
    jira_url: https://wetaca.atlassian.net/browse/WET-5012
    created_at: 2026-05-20T15:35:00Z
skipped:
  - group_id: G-011
    reason: human-declined
failed:
  - group_id: G-013
    error: "createJiraIssue returned 502"
    draft: <embedded draft for retry>
```

## Sprint "To be reviewed" — fallback estrategia

El plan original era asignar los tickets al sprint **"To be reviewed"** en su creación. **Problema**: el MCP `mcp__claude_ai_Atlassian__createJiraIssue` no garantiza poder pasar `sprint` directamente — depende de la configuración del proyecto + permisos del token.

**Estrategia adoptada (fallback robusto)**: NO se pasa `sprint` en la creación. En su lugar:

1. Label `to-be-reviewed-sprint` añadido por defecto a TODOS los drafts.
2. La descripción incluye una línea explícita al final:

```
> Please move it to the "To be reviewed" sprint manually (label `to-be-reviewed-sprint`).
```

3. El TL puede filtrar los tickets nuevos por la label y moverlos al sprint en bulk.

Esto es robusto: funciona aunque el MCP no soporte sprints, y la label es buscable + persistente. Si en el futuro la API soporta `sprint` directamente, se puede activar pasando un flag al `composeJiraFollowupDraft`.

## Labels por defecto

Todos los drafts llevan estas labels por orden:

1. `mr-auto-review` — para filtrar por origen.
2. `tech-debt` — categorización por defecto (sobreescribible si el group representa algo distinto).
3. `to-be-reviewed-sprint` — handoff al TL para asignar sprint.
4. `<extraLabels>` — módulos tocados (`payments`, `frontend`, `infra`, etc.) + `ticketId` del MR origen.

`extraLabels` se concatena tras los defaults sin duplicados (orden preservado).

## Priority mapping

Por defecto el draft mapea `severity` → Jira `priority`:

| Severity | Priority Jira |
|---|---|
| `must-fix` | `high` |
| `should-fix` | `medium` |
| `nit` | `low` |

**Override**: pasar `priority` explícito al `composeJiraFollowupDraft` (ej. `highest` para incidents).

## Manejo de errores

| Escenario | Acción |
|---|---|
| MCP Atlassian no disponible | Pipeline skipea silenciosamente; drafts quedan en `_report/jira-followups.yml` para creación manual |
| `createJiraIssue` devuelve 4xx (proyecto inexistente, etc.) | Persiste a `_report/jira-failed.yml` con `error` + `draft`. Continúa con el siguiente |
| `createJiraIssue` devuelve 5xx | El MCP de Atlassian gestiona retries internamente. Si tras retries falla → mismo trato que 4xx |
| Usuario cancela el batch | NO se crea ningún ticket. Los drafts se preservan |

**Idempotencia entre runs**: NO existe equivalente de `issue-hash` para Jira (un re-run del plugin podría crear duplicados). Mitigación:
- El humano puede ver `_report/jira-created.yml` en el workspace y decidir si re-ejecutar el pipeline Jira o no.
- Antes de aprobar un draft, el orquestador puede cross-referenciar Jira por título (no implementado en Wave 3.F — backlog Wave 6).

## Workflow del TL tras la creación

1. Filtrar Jira: `labels = "to-be-reviewed-sprint" AND created >= "-7d"`.
2. Mover los tickets al sprint "To be reviewed" (bulk edit).
3. Quitar la label `to-be-reviewed-sprint` tras la asignación (housekeeping).
4. Priorizar dentro del sprint según el campo `priority` heredado del draft.

## Limitaciones conocidas

1. **No detección de duplicados Jira** entre runs (cross-reference por título es candidato para Wave 6).
2. **No actualización de tickets existentes** — siempre crea uno nuevo. Si el group reaparece en re-runs, el humano decide en el gate.
3. **No vinculación bidireccional** automática con el MR — la descripción enlaza al MR, pero el MR no menciona los tickets creados. Para eso, postear un comment en el MR con los Jira keys creados (mejora candidata).
4. **Sprint name hardcoded** ("To be reviewed") — si Wetaca renombra el sprint, hay que tocar el draft template o la label.

## Test

El util `composeJiraFollowupDraft` tiene 14 tests unitarios cubriendo:
- Default labels y priority mapping.
- ExtraLabels sin duplicados.
- Description con citas file:line + URL del MR.
- Suggested fix opcional.
- Excerpt rendering como code block indented.
- Validación de input (occurrences ≥ 1, severity enum, etc.).

El tool MCP `jira_compose_followup_draft` tiene 6 tests más (smoke + validación Zod).

**No hay integration test contra Jira real** — el MCP de Atlassian es externo; sus tests son responsabilidad del proyecto Atlassian.
