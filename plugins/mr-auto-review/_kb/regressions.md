# KB: regressions

| Field | Value |
|---|---|
| concern | regressions |
| last_updated | 2026-05-20 |
| corpus_size | 0 |
| methodology_version | 1 |

## Reglas duras (citas a `.claude/rules/*.md`)

*(no project rule files cited for this concern yet — esta categoría se construye a base de blast-radius analysis; no se cubre con rule file estático)*

## Patrones blandos (heurísticas observadas en revisiones humanas)

*(stub — primera versión vacía. Para poblar: revisar comments históricos que digan "esto rompe…", "callers no actualizados", "side-effect inesperado", "shape change", etc.)*

### Heurísticas iniciales (sin corpus aún)

- **Renames silenciosos**: rename de export sin búsqueda exhaustiva en consumers (típicamente backend module-internal pero también frontend hooks/stores).
- **`null`/`undefined` introducidos**: ampliar un return type de `T` a `T | null` sin actualizar consumers que asumen `T`.
- **Default param cambiado**: cambiar el default value de un parámetro opcional; callers que no lo pasaban explícitamente ven nuevo comportamiento.
- **Side-effects nuevos en helpers puros**: añadir `logger.info`, `analytics.track`, mutación de input — los callers no esperan eso.
- **Order assumptions**: arrays donde el orden importa (delivery list, menu sections); reordenar puede romper UI o lógica downstream.
- **Stale comments**: el cambio invalida un comentario JSDoc o inline ≤30 líneas más abajo — el lector futuro se confundirá.
- **Removed exports**: un export desaparece pero imports vivos en otros módulos no se han limpiado — el build CI debería atrapar esto, pero si el import es lazy/dynamic, podría llegar a runtime.

## Anti-patrones a flaggar

*(derived from patterns above; manual curation recommended)*

- Cambio de firma de función exportada sin `grep -r` previo en repo.
- Cambio de shape de un GraphQL type sin actualizar consumers Apollo en frontend (puede solapar con R-apollo-cache si rompe cache normalization).
- Cambio en `models/*` (Mongoose schema) sin verificar consumers en `entities/` y `services/`.

## Cómo regenerar este fichero

Ver `_methodology/RUN-ANALYSIS.md`. Para este concern específicamente: el classifier debería matchear comments del tipo "callers don't expect this", "this breaks X", "rename without updating Y", "side-effect surprise".
