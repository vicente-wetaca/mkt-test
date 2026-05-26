# Run Analysis

Step-by-step para regenerar el KB de MR-auto-review desde MRs históricas de Wetaca.

## Pre-requisitos

- Node 22.16+
- Acceso al repo `wetaca/wetaca.com` con token `glpat-*` en el remote `origin`
- ~30 minutos para el pase completo

## Pasos

```bash
cd .claude/plugins/MR-auto-review/_kb/_methodology/scripts
npm install                  # primera vez sólo

# 1. Selección de MRs (~1 min)
npm run select               # output: 40 IIDs en stdout + .dev/MR-auto-review/_research/selection.json

# 2. Extracción (~10-20 min, ~25 segundos por MR)
npm run extract -- --all     # itera la selection.json, persiste a .dev/MR-auto-review/_research/raw/<iid>.json

# 3. Destilación (~10 segundos)
npm run distill              # genera .claude/plugins/MR-auto-review/_kb/<concern>.md

# 4. Review manual + commit
git diff .claude/plugins/MR-auto-review/_kb/
# Si los drafts son razonables → commit
git add .claude/plugins/MR-auto-review/_kb/
git commit -m "WET-4814: Wave 0 — KB regenerated from N=<size> MRs"
```

Todos los scripts anclan rutas a la raíz del worktree via `git rev-parse --show-toplevel`, así que se pueden invocar desde cualquier directorio dentro del repo.

## Cuándo regenerar

- El equipo añade reglas nuevas a `.claude/rules/`
- Quieres ampliar la ventana temporal del corpus (edita `SINCE`/`UNTIL` en `select-mrs.ts`)
- Aparecen patrones nuevos en reviews recientes que no están en el KB
- Cambias `SELECTION-CRITERIA.md` o `EXTRACTION-SCHEMA.md`

## Troubleshooting

- **`select` devuelve <20 MRs**: relaja filtros (`MIN_COMMENTS=3` en `select-mrs.ts`) o amplía ventana (`SINCE='2025-05-19'`).
- **`extract` falla con 401**: token revocado; regenera `git remote get-url origin` con uno válido.
- **`distill` deja patrones vacíos**: baja `MIN_RECURRENCES` a `2` en `distill.ts` y revisa el corpus.
- **`distill` muestra muchos comments con `concern: unknown`**: el classifier no detectó el concern. Añade regex en `classifier.ts:CONCERN_RULES` y re-ejecuta sólo `npm run distill` (la extracción ya tiene la clasificación cacheada — invalida con `rm .dev/MR-auto-review/_research/raw/*.json` y re-extrae si quieres re-clasificar).

## Corpus crudo

Los ficheros JSON en `.dev/MR-auto-review/_research/raw/` están gitignored y se regeneran. NO los commitees. Si quieres trazabilidad de qué MRs entraron en una pasada, usa `.dev/MR-auto-review/_research/selection.json` como manifiesto.
