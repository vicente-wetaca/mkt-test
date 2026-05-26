# Six-MR validation checklist (D22)

> Antes del cutover (Wave 5), el plugin debe pasar la validación con **6 MRs reales** de Wetaca. Esta plantilla guía la evaluación, registra resultados y aporta evidencia objetiva al go/no-go.

## Criterio de aceptación

Para que el cutover proceda:

| Métrica | Objetivo |
|---|---|
| MRs pasan el verdict positivo | **≥ 5 de 6** |
| Cobertura | El plugin detecta ≥ todos los issues "must-fix" que un reviewer humano detectaría en la misma MR |
| Volumen | Total de comments del plugin ≤ **1.5×** el del reviewer humano de referencia |
| Alucinaciones | **0** — ningún issue cita `file:line` inexistente, regla inventada, o vendor doc inexistente |
| Personas | Las 23 personas se manifiestan en los `title` SIN interferir con la substancia |

Si < 5/6 → NO cutover. Abrir issues específicos y re-validar tras los fixes.

## Stratification (D22)

Las 6 MRs deben cubrir esta distribución:

| # | Bucket | Origen | Notas |
|---|---|---|---|
| 1 | TINY | bugfix / typo | Test de no-overshoot (no debe sobre-revisar) |
| 2 | SMALL | feature pequeña (1-2 ficheros) | Test del flujo standard |
| 3 | MEDIUM | feature media (3-10 ficheros, 1 módulo) | Test de specialists múltiples |
| 4 | MEDIUM | infra (toca infra/) | Test de R-infra-protect + R-gitlab-ci |
| 5 | LARGE | cross-module (≥3 módulos) | Test de R-monorepo + R-regressions |
| 6 | LARGE/HUGE | con tests + deps | Test de R-tests + R-third-party-docs (Demetrio) |

Se pueden ajustar 2 huecos según los MRs disponibles en el ventana de las últimas 8 semanas.

## Plantilla por MR

Copia este bloque para cada uno de los 6 MRs validados. Guárdalos en
`.dev/MR-auto-review/_validation/six-mr/MR-<iid>.md`.

```markdown
# MR !<iid> — <title>

- **URL**: https://gitlab.com/wetaca/wetaca.com/-/merge_requests/<iid>
- **Author**: @<username>
- **Reviewer humano referencia**: @<reviewer-username>
- **Bucket esperado**: <TINY|SMALL|MEDIUM|LARGE|HUGE>
- **Módulos tocados**: <list top-level>
- **Validador**: <tu nombre>
- **Fecha**: YYYY-MM-DD

## Run del plugin

- Comando: `/mr-review --mr <iid>`
- Bucket detectado: <X>
- Specialists activados: <list>
- Tokens consumidos: ~<N>
- Tiempo wall-clock: ~<M> min

## Issues detectados por el plugin

| Group | Severity | Outcome | Confidence | Title | Acertado? |
|---|---|---|---|---|---|
| g-001 | must-fix | publish | high | <title> | ☐ sí / ☐ no — <razón si no> |
| g-002 | should-fix | follow-up | medium | <title> | ☐ sí / ☐ no |
| ... | | | | | |

## Comparación con el reviewer humano

| Métrica | Humano | Plugin | Veredicto |
|---|---|---|---|
| Comments must-fix | <N> | <N> | ☐ cobertura suficiente |
| Comments should-fix | <N> | <N> | ☐ |
| Comments nit | <N> | <N> | ☐ |
| **Total comments** | <N> | <N> | ☐ ≤ 1.5× del humano |
| Alucinaciones | n/a | <N> | ☐ 0 |
| Cita regla inválida | n/a | <N> | ☐ 0 |
| file:line inexistente | n/a | <N> | ☐ 0 |

## Notas cualitativas

- Personas: ¿se manifiestan sin interferir? ☐ sí / ☐ no — <ej>
- ¿Algún false-positive notable? <texto>
- ¿Algún false-negative crítico? <texto>
- ¿Hubo algún signal `BLOCKER_ESCALATION` o `KB_GAP` interesante? <texto>
- ¿La selección final (Paso 10) fue cómoda? ☐ sí / ☐ no — <razón>
- ¿Los follow-ups Jira (Paso 10.quinquies) tenían sentido? ☐ sí / ☐ no — <texto>

## Verdict

- ☐ **PASS** — cobertura ≥ humano, volumen ≤ 1.5×, 0 alucinaciones, personas OK
- ☐ **FAIL** — al menos uno de los criterios falla. Detalle:
  - <razón>
- ☐ **AMBIGUOUS** — necesita una segunda opinión

## Acciones

- Si PASS: ✓ contar para el ≥ 5/6
- Si FAIL: abrir follow-up Jira / GH issue describiendo el gap
- Si AMBIGUOUS: pedir review a un segundo developer
```

## Consolidación

Cuando se hayan completado los 6 MRs, escribir `_validation/six-mr/SUMMARY.md`:

```markdown
# Six-MR validation — SUMMARY

- MRs validados: 6
- PASS: <N>
- FAIL: <N>
- AMBIGUOUS: <N>

## Distribución por bucket

| Bucket | MRs | PASS |
|---|---|---|
| TINY | 1 | <N> |
| SMALL | 1 | <N> |
| MEDIUM | 2 | <N> |
| LARGE | 2 | <N> |
| HUGE | 0 (no hubo) | n/a |

## Métricas agregadas

- Cobertura agregada: <%> de los must-fix humanos detectados por el plugin
- Volumen agregado: <X.Y>× el del humano
- Alucinaciones agregadas: <N>

## Decisión

- ☐ **GO** — cutover aprobado. Proceder con `docs/MIGRATION.md` pasos 3-5.
- ☐ **NO GO** — abrir issues y re-validar en N MRs adicionales antes de retomar.

## Issues bloqueantes detectados

1. <descripción + link al ticket>
2. ...
```

## Hot tips para la validación

- **Empezar por TINY**: si el plugin sobre-revisa un fix de typo, el flow tiene un problema de bias. Es la señal más rápida para detectar overshoot.
- **MR multi-módulo (LARGE)**: el mejor test para R-triage. Verifica que las agrupaciones cruzan módulos sin perder información.
- **MR con cambio de versión `package.json`**: validador específico de Demetrio el Documentao (R-third-party-docs). Verifica que la cita a la doc oficial es correcta y la URL real.
- **MR con tests**: valida que R-tests detecta gaps de coverage (no solo critica los specs existentes).
- **No esperes 100% match con el humano**: el plugin puede flagear cosas que el humano dejó pasar y viceversa. El criterio es "no peor que el humano + sin alucinaciones".

## Plantillas auxiliares

Bash one-liner para arrancar la validación de una MR:

```bash
IID=<iid>
mkdir -p .dev/MR-auto-review/_validation/six-mr
cp .claude/plugins/MR-auto-review/docs/SIX-MR-CHECKLIST.md \
   .dev/MR-auto-review/_validation/six-mr/MR-${IID}.md
# Editar el fichero para rellenar los placeholders
```

Después: `/mr-review --mr ${IID}` y registra los resultados en el fichero.
