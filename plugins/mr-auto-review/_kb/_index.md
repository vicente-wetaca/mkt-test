# MR-auto-review KB Index

> Knowledge base distilled from empirical analysis of historical Wetaca MRs.
> Each entry corresponds to one concern handled by an `R-*` reviewer agent.
> Regenerable via `_methodology/RUN-ANALYSIS.md`.

## v1 baseline — 2026-05-19

- **Corpus**: 39 MRs (selection window 2025-11-19..2026-05-19)
- **Total comments classified**: 2522 (1024 technical, 1498 conversational residue → `unknown`)
- **Patterns extracted** (≥3 same-body recurrences): **6** across 4 concerns
- **Known gaps**: classifier regex is broad — `apollo-cache` and `di` likely over-match. See `_candidate-agents.md`.

## Per-concern stats

| Concern | File | Last updated | Comments | Patterns |
|---|---|---|---|---|
| apollo-cache | [apollo-cache.md](apollo-cache.md) | 2026-05-19 | 413 | 2 |
| di | [di.md](di.md) | 2026-05-19 | 209 | 1 |
| perf-backend | [perf-backend.md](perf-backend.md) | 2026-05-19 | 146 | 2 |
| tests | [tests.md](tests.md) | 2026-05-19 | 84 | 1 |
| event-types | [event-types.md](event-types.md) | 2026-05-19 | 59 | 0 |
| security | [security.md](security.md) | 2026-05-19 | 51 | 0 |
| mongo-queries | [mongo-queries.md](mongo-queries.md) | 2026-05-19 | 16 | 0 |
| code-quality | [code-quality.md](code-quality.md) | 2026-05-19 | 13 | 0 |
| migrations | [migrations.md](migrations.md) | 2026-05-19 | 13 | 0 |
| mongo-aggs | [mongo-aggs.md](mongo-aggs.md) | 2026-05-19 | 9 | 0 |
| monorepo | [monorepo.md](monorepo.md) | 2026-05-19 | 8 | 0 |
| homogeneity | [homogeneity.md](homogeneity.md) | 2026-05-19 | 2 | 0 |
| gitlab-ci | [gitlab-ci.md](gitlab-ci.md) | 2026-05-19 | 1 | 0 |
| infra-protect | [infra-protect.md](infra-protect.md) | 2026-05-19 | 0 | 0 |
| perf-frontend | [perf-frontend.md](perf-frontend.md) | 2026-05-19 | 0 | 0 |
| solid | [solid.md](solid.md) | 2026-05-19 | 0 | 0 |
| mr-hygiene | [mr-hygiene.md](mr-hygiene.md) | 2026-05-19 | 0 | 0 |
| functional-completeness | [functional-completeness.md](functional-completeness.md) | 2026-05-20 | 0 | 0 |
| regressions | [regressions.md](regressions.md) | 2026-05-20 | 0 | 0 |
| third-party-docs | [third-party-docs.md](third-party-docs.md) | 2026-05-20 | 0 | 0 |

## Stubs added in Wave 2.1.bis (2026-05-20)

`functional-completeness` (D23) and `regressions` (D24) were introduced in Wave 2 without empirical corpus yet. They ship with heuristics-only KBs; populate via `_methodology/RUN-ANALYSIS.md` once the classifier is extended to recognise their comment patterns.

## Stub added in Wave 3.E.b (2026-05-20)

`third-party-docs` (R-third-party-docs / Demetrio el Documentao) covers vendor documentation conformance + version freshness. Unlike other agents, its primary source of truth is the vendor's own docs in real time (via `WebFetch`+`WebSearch`), not the KB. The KB stub captures recurring mismatch patterns to flag faster on subsequent runs.

## Next iterations (deferred work)

1. **Tune over-matching regex** in `classifier.ts`: `apollo-cache` and `di` are catching general mentions. Tighten patterns.
2. **Tune under-matching regex**: `infra-protect`, `perf-frontend`, `solid`, `mr-hygiene` got 0 comments. The corpus likely has reviews for some of these — verify by sampling `unknown` and re-extending rules.
3. **Body normalization**: pattern threshold ≥3 same-body found only 6 patterns from 1024 technical comments. Most reviews are uniquely phrased. Consider semantic clustering (embedding-based) in a future version instead of literal normalization.
4. **Add more concerns**: see `_candidate-agents.md`.
