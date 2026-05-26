---
name: mr-review-status
description: "Muestra el estado del workspace activo de MR-auto-review (qué corrió, qué se publicó, qué quedó pendiente). Use as: /mr-review-status [--ticketId <WET-####>|--mr <iid>]."
---

# /mr-review-status — Estado del workspace

Eres el **main agent** ejecutando una consulta de estado. Tu trabajo es leer los outputs persistidos por una ejecución previa de `/mr-review` y resumirlos al humano. **No** ejecutas reviews, **no** posteas a GitLab, **no** llamas a Jira. Solo lectura.

---

## Argumentos

| Flag | Default | Efecto |
|---|---|---|
| `--ticketId <WET-####>` | autodetect del branch | `WET-####` o `local-<slug>` del workspace a inspeccionar |
| `--mr <iid>` | off | Resuelve el `ticketId` desde la MR (busca el branch via `gitlab_get_mr` y aplica la regla de naming) |

Si no se pasa ningún flag → autodetect del branch actual igual que `/mr-review`.

---

## Pasos

1. **Resolver ticketId**:
   - Si `--ticketId` → úsalo.
   - Si `--mr <iid>` → llama `gitlab_get_mr({iid})`, extrae `source_branch`, aplica el regex `^[a-z]+/WET-(\d+)--.+$`.
   - Si no, `git rev-parse --abbrev-ref HEAD` + el mismo regex; fallback `local-<slug>`.

2. **Inventario del workspace** vía `mr_list(ticketId)` y `mr_list(ticketId, filters={kind: "report"})`. Captura:
   - Issues por agent: `mr_list(filters={kind: "issue"})`
   - Reports del triage: `mr_list(filters={kind: "report"})`
   - Signals: lectura directa de `_signals/log.jsonl` vía `mr_read` si existe
   - Scripts output: contar `_context/scripts-output/*.json`

3. **Estado de posting** (sólo si existe `_report/posted-discussions.yml`):
   - Cuenta de publicados.
   - Cuenta de `position_dropped: true`.
   - Cuenta de `posting-errors.yml` si existe.
   - Marker note: lectura de `_report/marker-note.yml` si existe → `noteId` + timestamp.
   - Aborts: si existe `_report/aborted-posting.yml`, reporta `reason`.

4. **Estado de Jira** (sólo si existe `_report/jira-created.yml` o `_report/jira-followups.yml`):
   - Drafts compuestos: count de `jira-followups.yml`.
   - Creados: count de `jira-created.yml` con sus `WET-####`.
   - Failed: count de `jira-failed.yml` con razones.

5. **Resumen final**. Imprime al usuario en stdout:

```
Workspace: .dev/MR-auto-review/<ticketId>/

Run anterior:
  Bucket:           <TINY|SMALL|MEDIUM|LARGE|HUGE>
  Mode:             <local|remote>
  MR:               !<iid>  <webUrl>           (si remote)
  Branch:           <branch> vs <baseRef>

Agents que produjeron:
  R-code-quality:   <N> issues
  R-tests:          <N> issues
  ...
  (sólo los que escribieron algo)

Triage:
  Groups:           <N>
  Severity matrix:  must-fix=<N>, should-fix=<N>, nit=<N>
  Outcomes:         publish=<N>, follow-up=<N>, reject=<N>, needs-human-decision=<N>

Posting (si remote):
  Publicados:        <N>
  Position dropped:  <N>
  Errores graciosos: <N>
  Aborted:           <reason or '-'>
  Marker note:       !<noteId> at <timestamp>

Follow-ups Jira:
  Drafts:           <N>
  Created:          <N> (claves: WET-1234, WET-1235, ...)
  Failed:           <N>

Signals:             KB_GAP=<N>, BLOCKER=<N>, AMBIGUITY=<N>, SCOPE=<N>

Para detalle:
  cat <ruta absoluta al review-summary>
```

Si el workspace NO existe (run nunca ejecutado para ese ticketId):

```
No hay workspace para <ticketId>. Ejecuta /mr-review primero.
```

---

## Hard rules

- **Sólo lectura**: NUNCA `mr_write`, `gitlab_create_*`, `createJiraIssue`. Si el usuario quiere modificar algo, redirígelo al comando apropiado.
- **No reportes campos vacíos** si el fichero no existe — omite la sección entera. Mejor "no hubo posting" que "Posting: 0/0/0".
- **No inventes números**. Si un fichero está malformado, reporta el error y termina.
- **No re-corras agents**. Esto es estado, no review.
