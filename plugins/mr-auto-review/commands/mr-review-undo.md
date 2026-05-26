---
name: mr-review-undo
description: "Borra las discussions/notas posteadas por la última ejecución de /mr-review en una MR (incluido el marker note). Operación destructiva con gate humano. Use as: /mr-review-undo [--mr <iid>|--ticketId <WET-####>] [--include-marker]."
---

# /mr-review-undo — Revertir posting

Eres el **main agent** ejecutando una operación destructiva sobre GitLab. Tu trabajo es borrar las notas que la última ejecución de `/mr-review` posteó en una MR. **Lo haces sólo tras gate humano explícito y solo afectas a notas registradas en el workspace local** (`_report/posted-discussions.yml`).

> ⚠️ **Esta operación NO se puede deshacer desde GitLab**. Si el humano necesita recuperar un comment borrado, tendría que re-correr `/mr-review` (que regeneraría el body via composición + issue-hash determinista, pero perdería las respuestas humanas previas a ese comment).

---

## Argumentos

| Flag | Default | Efecto |
|---|---|---|
| `--ticketId <WET-####>` | autodetect del branch | Ticket cuyo workspace se inspecciona |
| `--mr <iid>` | off | Override del MR IID al que se aplican los DELETEs |
| `--include-marker` | off | También borra el marker note `*marker: run-completed*` |
| `--all` | off | Aprobar todo automáticamente (sin selección individual). REQUIERE confirmación previa |

---

## Pasos

1. **Resolver ticketId + MR_IID**:
   - `ticketId` igual que en `/mr-review-status`.
   - `MR_IID`: si `--mr` → úsalo; si no, lee `_report/posted-discussions.yml` y toma el IID que persistió la última run; si el fichero no existe → "No hay record de posting para <ticketId>. Nada que deshacer." y termina.

2. **Cargar el log de la última run** vía `mr_read` sobre `_report/posted-discussions.yml`. Estructura esperada:

```yaml
posted:
  - group_id: G-007
    discussion_id: ada59ee0...
    first_note_id: 1234567
    issue_hash: 7f3e9a2b4c5d6e7f
    position_dropped: false
    posted_at: <ISO 8601 UTC>
marker_note:
  note_id: 998877    # opcional, sólo si la run llegó al marker
```

3. **Verificar autoría**. Llama `gitlab_list_notes({iid: MR_IID})` y construye un set de `noteId → author.username`. Para cada `firstNoteId` que vayas a borrar, confirma que el author es el usuario del token (en la práctica: el author del marker note debería matchear el de todos los discussion notes). Si NO matchea → log warning y NO incluyas esa nota en la lista de borrado.

4. **Gate humano**. Presenta la lista al usuario:

```
MR !<iid> — Discussions registradas por la última run de /mr-review (<timestamp del marker>):

1. G-007  note #1234567   "Refactor: eliminate `as unknown as` casts..."
2. G-011  note #1234580   "Mongoose v5.x EOL — migrate to v8"
3. G-014  note #1234599   "Apollo cache fetchPolicy missing on subscription query"
... (<N> en total)

Marker note: #998877   "🤖 MR-auto-review · run completed (...)"

Selección:
  - all         → borrar las N discussions (excluye marker salvo --include-marker)
  - 1,3         → borrar sólo esas
  - none        → cancela
  - --include-marker añadido → incluye también el marker
```

5. **Confirmación explícita** (si `--all` o "all"): pregunta una segunda vez:

```
⚠️ Vas a borrar <N> notas en MR !<iid>. Esto NO se puede deshacer en GitLab.
¿Confirmas? [yes/no]
```

6. **Ejecuta los DELETE**. Por cada nota aprobada, llama:

```
mcp__plugin_mr-auto-review_mr-auto-review__gitlab_delete_mr_note({iid: MR_IID, noteId: <firstNoteId>})
```

- Si el DELETE falla con 403 (autoría) → registra en `_report/undo-skipped.yml` con razón y CONTINÚA.
- Si el DELETE falla con 404 (nota ya borrada manualmente por alguien) → trátalo como éxito silencioso (la idempotencia es deseable aquí).
- Si el DELETE falla con 5xx → el cliente ya reintenta; si tras retries falla → registra en `_report/undo-failed.yml` y CONTINÚA.

7. **Si `--include-marker`**: ejecuta el mismo flujo sobre el `note_id` del marker.

8. **Persiste** el resultado en `_report/undo-log.yml`:

```yaml
undone:
  - group_id: G-007
    first_note_id: 1234567
    undone_at: <ISO 8601 UTC>
skipped:
  - group_id: G-011
    reason: human-declined
failed:
  - group_id: G-014
    reason: 403-forbidden
marker_undone: true   # sólo si --include-marker y fue exitoso
```

9. **Reporta al usuario**:

```
Undo completado en MR !<iid>:
  Borradas:        <N>
  No autorizadas:  <M> (autoría no matchea — preservadas)
  Skipped humano:  <K>
  Errores:         <E>
  Marker:          <borrado|preservado>
```

---

## Hard rules

- **Sólo borra notas registradas en `_report/posted-discussions.yml`** — NUNCA borres notas de la MR que no aparezcan en ese log. Aunque el author matchee, si no está en el log, no es tuya (la posteó un humano u otra herramienta).
- **Gate humano obligatorio** — no aceptes `--all` sin confirmación explícita del usuario en el mismo turno. La regla `[[feedback-no-git-writes-without-explicit-per-action-approval]]` aplica también a DELETEs contra GitLab.
- **Verifica autoría** antes de cada DELETE. Si la nota no la posteó el token user, registra en `undo-skipped.yml` y continúa — NO la borres con --include-marker tampoco.
- **El undo NO purga el workspace local**. `_report/posted-discussions.yml` se preserva (auditable). Si el humano quiere limpiar el workspace local, ese es trabajo de otro comando (`mr-review-kb cleanup`, Wave 4).
- **Si el log está vacío o no existe** → reporta "Nada que deshacer" y termina sin tocar GitLab.
- **No tocar notas humanas**. Las que NO estén en el log o cuya autoría no matchee → preservadas. Mejor un undo incompleto que borrar un comment de un compañero.
