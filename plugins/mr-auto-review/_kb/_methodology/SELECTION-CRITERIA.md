# Selection Criteria (v1)

Filtros que aplica `select-mrs.ts` para construir el sample del análisis empírico.

## Filtros

| Criterio | Valor | Implementación |
|---|---|---|
| Estado | merged | `state=merged` en API |
| Ventana temporal | últimos 6 meses | `SINCE`/`UNTIL` en `select-mrs.ts` |
| Reviewers humanos distintos | ≥2 | `passesFilters` en `filter.ts` (excluye bots y autor) |
| Comments no-sistema | ≥5 | `user_notes_count >= 5` |
| Sample cap | 40 | `CAP` en `select-mrs.ts` |
| Estratificación | 1/3 backend, 1/3 frontend, 1/3 infra | `stratifySample` en `stratify.ts` |

## Bots excluidos

`gitlab-bot`, `wetaca-bot`, `dependabot`, `renovate-bot` (extender en `filter.ts:BOT_USERNAMES` cuando aparezcan otros).

## Estratificación

`classifyAreaFromFiles` mapea cada MR a `backend|frontend|infra` por la mayoría de paths en su diff:

- `backend`: `services/`, `modules/`, `packages/`, `shared/`, `entities/`, `models/`
- `frontend`: `frontend/`
- `infra`: `infra/`, `.gitlab*`
- default: `backend`

Cuando un área tiene supply insuficiente para su cuota, el shortage se redistribuye entre las otras (`stratifySample`).

**Observación primer run (2025-11-19..2026-05-19)**: 461 MRs merged, 39 pasan filtros, distribución 23/15/1 (backend/frontend/infra). Infra supply-constrained — confirma que los cambios de infra en este repo rara vez involucran 2+ reviewers + 5+ comments.

## Versionado

Cambios a este fichero → bump `methodology_version` en `distill.ts` para que las próximas regeneraciones del KB marquen la diferencia.
