# KB: perf-backend

| Field | Value |
|---|---|
| concern | perf-backend |
| last_updated | 2026-05-19 |
| corpus_size | 39 |
| methodology_version | 1 |

## Reglas duras (citas a `.claude/rules/*.md`)

- .claude/rules/mongodb-aggregations.md

## Patrones blandos (heurísticas observadas en revisiones humanas)

### 🛠️

- **Recurrences**: 6
- **MRs**: !3428, !3588, !3593, !3622, !3705, !3705
- **Example**: `modules/wetaca-core/src/logistics/modules/delivery-options/mappers/get-delivery-option-with-dates.ts:103` (MR !3428)

### Fixes masivos de los ficheros de gift rules y nuevas reglas para que no la vuelva a liar:
 - 6ec9599bb6778f993ec85e75d59b322636d79ccd
 - 01aaefe5722febc67ba69f8783119d60e4880a71

- **Recurrences**: 4
- **MRs**: !3602, !3602, !3602, !3602
- **Example**: `services/backoffice/frontend/src/gift-rules/GiftRulesDeleteDialog.tsx:10` (MR !3602)

## Anti-patrones a flaggar

*(derived from patterns above; manual curation recommended)*

## Cómo regenerar este fichero

Ver `_methodology/RUN-ANALYSIS.md`.
