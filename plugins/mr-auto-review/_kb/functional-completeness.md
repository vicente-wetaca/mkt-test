# KB: functional-completeness

| Field | Value |
|---|---|
| concern | functional-completeness |
| last_updated | 2026-05-20 |
| corpus_size | 0 |
| methodology_version | 1 |

## Reglas duras (citas a `.claude/rules/*.md`)

*(no project rule files cited for this concern yet — esta categoría se basa en la metadata del ticket Jira; no se cubre con un rule file estático)*

## Patrones blandos (heurísticas observadas en revisiones humanas)

*(stub — primera versión vacía. Para poblar: ejecutar la metodología `_methodology/RUN-ANALYSIS.md` extendiéndola con un filtro para comments que digan "scope incomplete", "missing AC", "the ticket said", "no veo el cambio para…", etc.)*

### Heurísticas iniciales (sin corpus aún)

- **Multi-market**: cuando el ticket dice "para todos los markets" o "ES y DE" — verificar que ambos están tocados en el diff (frontend i18n + backend market checks + infra stack flags).
- **Acceptance criteria explícitos**: tickets que listan AC1..ACn en Jira. Cubrir cada uno con cita de archivo.
- **Tickets bug**: el diff debe contener un test de regresión que falla pre-fix y pasa post-fix.
- **Tickets feature**: el diff debe contener test happy-path + ≥1 edge case + actualización de docs si aplica.
- **Sub-tareas linkeadas**: si el ticket tiene sub-tareas con status `In Progress` o `Open`, verificar si quedan colgando del MR actual.

## Anti-patrones a flaggar

*(derived from patterns above; manual curation recommended)*

- "Closes WET-XXXX" en MR description cuando faltan ACs del ticket — must-fix antes de mergear.
- Scope expansion silencioso: cambios mayores no descritos en MR description ni en ticket.
- Multi-market PR que sólo toca un market sin justificación en el body.

## Cómo regenerar este fichero

Ver `_methodology/RUN-ANALYSIS.md`. Para este concern específicamente: añadir un classifier que matchee comments del tipo "the ticket mentions X" / "AC says Y" / "scope incomplete" / "missing from this MR" en `_methodology/scripts/classifier.ts`.
