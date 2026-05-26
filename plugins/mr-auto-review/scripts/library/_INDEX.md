# Scripts Library — MR-auto-review

> Scripts pre-auditados que el orquestador puede invocar en el pre-pass.
> El reviewer NUNCA ejecuta scripts directamente: lee `_context/scripts-output/<name>.json` que el orquestador ha generado.

## Versioning

Cada script lleva header estandarizado:

```bash
# !script-id: <id-kebab>
# !purpose: <1-line>
# !inputs: <args + env vars>
# !outputs: stdout JSON con schema declarado
# !audited: YYYY-MM-DD (initial audit / re-audit, manual review by owner)
# !version: SEMVER
```

Cualquier cambio funcional → bump `!version` + actualiza `!audited`.

## Catálogo (8 scripts)

| Script | Propósito | Inputs | Outputs (key fields) | Última auditoría | Versión |
|---|---|---|---|---|---|
| [compute-mr-size.sh](compute-mr-size.sh) | Tamaño del diff + bucket sugerido (TINY/SMALL/MEDIUM/LARGE/HUGE) | patch file, base ref | `bucket`, `totalLines`, `fileCount` | 2026-05-20 | 1.0.0 |
| [stratify-by-module.sh](stratify-by-module.sh) | Mapea ficheros del diff a workspaces top-level (packages/, services/, etc.) | patch file, base ref | `modules` (map), `totalFiles`, `files` | 2026-05-20 | 1.0.0 |
| [detect-mongo-pipelines.sh](detect-mongo-pipelines.sh) | Encuentra `$match`/`$group`/`$lookup`/`.aggregate(` en líneas añadidas | patch file, base ref | `pipelinesFound[]`, `count` | 2026-05-20 | 1.0.0 |
| [detect-di-usage.sh](detect-di-usage.sh) | Encuentra `functionInjection`/`objectInjection` en líneas añadidas | patch file, base ref | `diUsage[]`, `count` | 2026-05-20 | 1.0.0 |
| [detect-secrets-touch.sh](detect-secrets-touch.sh) | Keywords sensibles con allowlist (passwordReset, hashedId, etc.) | patch file, base ref | `secretsTouched[]`, `count` | 2026-05-20 | 1.0.0 |
| [detect-env-vars-changes.sh](detect-env-vars-changes.sh) | env.ts/.env/.env.example tocados + consistencia entre env.ts y .env.example | patch file, base ref | `envFilesChanged[]`, `inconsistent[]` | 2026-05-20 | 1.0.0 |
| [detect-react-lazy.sh](detect-react-lazy.sh) | `React.lazy`/`dynamic import()` en líneas añadidas | patch file, base ref | `lazyUsage[]`, `count` | 2026-05-20 | 1.0.0 |
| [detect-vendor-usage.sh](detect-vendor-usage.sh) | package.json/lockfiles tocados + imports nuevos desde paquetes externos + heurística de uso nuevo de deps ya instaladas | patch, base ref, repo root | `packageJsonChanged[]`, `lockfileChanged[]`, `newImports[]`, `modifiedUsageCandidates[]`, `externalPackages[]`, `count` | 2026-05-20 | 1.0.0 |
| [run-tests-summary.sh](run-tests-summary.sh) | Ejecuta `jest --json` (full o paths), filtra a resumen <2KB con failures detalladas, 5min timeout | $@ paths (opcional), $WORKSPACE_ROOT | `passed`, `failed`, `failures[]`, `timeout` | 2026-05-20 | 1.0.0 |

## Mapping concern → script (orquestador)

El orquestador, tras el pre-pass, decide qué specialists despachar según outputs:

| Concern / Specialist | Script(s) consumido(s) | Condición de activación |
|---|---|---|
| R-mongo-aggs | detect-mongo-pipelines.json | `count > 0` |
| R-di | detect-di-usage.json | `count > 0` |
| R-security | detect-secrets-touch.json, detect-env-vars-changes.json | `secretsTouched.count > 0` OR `inconsistent.length > 0` |
| R-mr-hygiene | detect-env-vars-changes.json | siempre activo, lee este output como evidencia |
| R-perf-frontend | detect-react-lazy.json, stratify-by-module.json | `lazyUsage.count > 0` OR `modules.frontend > 0` |
| R-infra-protect | stratify-by-module.json | `modules.infra > 0` |
| R-gitlab-ci | stratify-by-module.json (paths `.gitlab*`) | match `.gitlab` en files[] |
| R-monorepo | stratify-by-module.json | `distinctModules >= 3` OR cambios en packages/shared/entities/models |
| R-tests | run-tests-summary.json | siempre activo si bucket >= SMALL |
| R-homogeneity | (no script) | siempre activo (transversal) |
| R-functional-completeness | (no script — usa Jira MCP) | si ticketId provisto |
| R-regressions | (no script — usa Grep directamente) | si hay exports modificados (.ts/.tsx) |
| R-third-party-docs | detect-vendor-usage.json | `count > 0` (packageJson o lockfile cambia, o newImports/modifiedUsageCandidates no vacíos) OR `--include-docs-check` |

## Cómo añadir un script nuevo a la library

1. Implementa el script bash en `scripts/library/<id>.sh` con header completo.
2. Corre `R-script-auditor` (Wave 2.3) sobre él una vez con `auditor-result: APPROVED`.
3. Añade entrada en este `_INDEX.md` con file:line de outputs.
4. Si el orquestador debe activar un specialist en base a su output, añade el mapeo en la sección "Mapping" arriba + actualiza `commands/mr-review.md`.
5. Commit como `WET-XXXX: add <id> to scripts library` con autorización del owner.

## Cómo deprecar un script

1. Mover a `scripts/_deprecated/<id>.sh` con marca `# !deprecated: YYYY-MM-DD` añadida al header.
2. Eliminar entrada de este `_INDEX.md`.
3. Eliminar mapeo en `commands/mr-review.md`.

## Audit log inicial

| Script | Auditor | Fecha | Verdict | Notas |
|---|---|---|---|---|
| compute-mr-size.sh | owner-manual | 2026-05-20 | PENDING | Inicial — depends sólo on git, grep, awk, sed |
| stratify-by-module.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk, sed |
| detect-mongo-pipelines.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk |
| detect-di-usage.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk |
| detect-secrets-touch.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk; allowlist incluida |
| detect-env-vars-changes.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk, sort, comm |
| detect-react-lazy.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk |
| detect-vendor-usage.sh | owner-manual | 2026-05-20 | PENDING | Inicial — git, grep, awk, jq (opcional); analiza package.json y diff |
| run-tests-summary.sh | owner-manual | 2026-05-20 | PENDING | Ejecuta `yarn jest` — wraps con timeout 5min; output filtrado por jq |

`PENDING` se cambia a `APPROVED` por el owner del repo tras review manual (Wave 2 closing task).
