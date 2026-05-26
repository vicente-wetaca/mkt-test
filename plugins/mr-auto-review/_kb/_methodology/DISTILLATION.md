# Distillation Algorithm (v1)

Cómo `distill.ts` convierte el corpus crudo en `_kb/<concern>.md`.

## Pasos

1. **Load**: leer todos los `_research/raw/<iid>.json` via `listRawMRIids()` + `readRawMR()`.
2. **Aggregate**: agrupar comments por `concern` (`aggregateByConcern`).
3. **Pattern extraction**: por cada concern, agrupar comments con body similar (normalize: lower + strip puntuación + collapse espacios). Quedarse con los grupos con `≥MIN_RECURRENCES` (default 3) ocurrencias.
4. **Generate MD**: por cada concern, generar fichero con frontmatter (corpus_size, last_updated) + reglas duras (citas a `.claude/rules/`) + patrones blandos (canonical body + recurrences + MR list).

## Tuning

- **`MIN_RECURRENCES = 3`** → balance entre ruido y señal. Baja a 2 si el corpus es <30 MRs; sube a 4 si hay >60 MRs.
- **Rule citations** están hardcoded en `RULE_CITATIONS` dentro de `distill.ts`. Cuando se añade un rule file, actualizar este mapping.
- **`methodology_version`** dentro de `distill.ts` se bumpea cuando el algoritmo cambia (no cuando sólo cambia el corpus).

## Review manual obligatoria

`distill.ts` produce DRAFTS. Antes de commitear:

1. Lee cada `_kb/<concern>.md` generado
2. Elimina patrones falsos positivos (comments mal clasificados)
3. Reescribe canonical bodies para mejor legibilidad (el normalize colapsa cosas que ayudan a humanos)
4. Añade citas concretas a sub-secciones de los rule files (el draft sólo cita el fichero, tú añades el anchor: `code-style.md#typescript`)
5. Si detectas un patrón cross-concern que merece tener su propio agent, añade entrada en `_candidate-agents.md`

## Por qué hay corpus_size en cada KB

Las dos cosas que un consumer del KB necesita saber:

1. **Cobertura**: el patrón está respaldado por `recurrences` ocurrencias entre `corpus_size` MRs analizados. `recurrences=3 / corpus_size=40` ⇒ 7.5% del corpus repitió este patrón. Información útil para juzgar la solidez del patrón.
2. **Frescura**: `last_updated` indica cuándo se hizo la última pasada. Una KB con `last_updated` >6 meses sin nueva pasada debería regenerarse.

## Outputs

```
.claude/plugins/MR-auto-review/_kb/
├── _index.md                    # actualizado manualmente; el script no lo regenera
├── _candidate-agents.md         # se popula manualmente cuando aparezcan candidatos
├── _mr-write-kind-candidates.md # idem
├── code-quality.md              # regenerados por distill
├── tests.md
├── di.md
├── ... (17 concerns)
└── _methodology/                # esta doc + scripts
```

## Cómo regenerar SOLO la destilación sin re-extraer

```bash
cd .claude/plugins/MR-auto-review/_kb/_methodology/scripts
# Asumiendo que .dev/MR-auto-review/_research/raw/ ya tiene JSONs:
npm run distill
```

Cambios típicos que sólo necesitan re-distill (no re-extract):
- Bump `MIN_RECURRENCES` para ver más/menos patrones
- Añadir entradas a `RULE_CITATIONS`

Cambios que requieren re-extract (porque la clasificación se cachea en los JSONs):
- Cambios en `classifier.ts` (nuevos regex, nuevos concerns, ajustes de severity)
- Cambios en el schema de extracción

Para re-extract: `rm -rf .dev/MR-auto-review/_research/raw && npm run extract -- --all`.
