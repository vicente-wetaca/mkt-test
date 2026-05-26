# Candidate Agent Types

> Concerns recurrentes detectados durante el análisis empírico que NO encajan en el catálogo actual de 20 agent types.
> Evaluar en Wave 2 si justifican declararse como agent dedicado o sub-check dentro de uno existente.

## v1 (2026-05-19) — observaciones del primer corpus

| Candidate | Reason | Evidence (MR IIDs) | Decision (after wave 2 review) |
|---|---|---|---|

*(empty — la primera pasada no encontró concerns nuevos; las gaps son de clasificador, no de catálogo)*

## Notas sobre el clasificador (no nuevos agents, sólo refinamientos)

1. **`apollo-cache` sobre-matchea** (413 comments es desproporcionado). Probablemente el regex `/\bapollo\b/i` engancha menciones genéricas. Tightening: requerir co-ocurrencia con `fetchPolicy|useQuery|client\.query` para confirmar.

2. **`di` sobre-matchea** (209 comments). El regex `/\binyect(ar|ado|able)\b/i` puede engancharse en contextos no-DI (p.ej. "inyectar HTML"). Tightening: exigir co-ocurrencia con `functionInjection|objectInjection|builder|use-cases?`.

3. **`infra-protect` 0 comments**. Pasa raro porque el corpus tiene MRs de infra (aunque pocos). Probable: los pocos MRs de infra (1 en este corpus) no tuvieron 5+ comments. No es gap del clasificador; es gap de muestra.

4. **`perf-frontend` 0 comments**. Pero hay PRs de perf-frontend activos en el repo (lazy-load WET-4715). Probable: los patterns para esto no salen en MRs sino en commits. Reconsiderar fuentes.

5. **`solid` y `mr-hygiene` 0 comments**. SOLID/hygiene rarely surface as direct review comments — emergen como sugerencias indirectas. Esperable; tightening de su regex no ayudaría.

6. **El 59% de los comments es `unknown`** — son conversación casual ("Toda la razón!", emoji, agreement). El clasificador acertadamente los rechaza. No es problema: el ratio 1024 technical / 1498 conversational es realista para reviews de Wetaca.

## Plan para v2

- Re-ejecutar `select-mrs.ts` con ventana mayor (12 meses) → más supply para infra y perf-frontend.
- Tightening de `apollo-cache` y `di` para reducir over-match.
- Considerar separar `mr-hygiene` en sub-checks reales (env vars, ticket linked, template) — actualmente el regex es flojo.
- Investigar si commits (no MRs) son una fuente complementaria para `perf-frontend`.
