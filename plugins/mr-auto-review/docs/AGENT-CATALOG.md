# Agent catalog — MR-auto-review

> Roster completo de los 23 agent types declarados. Wave 1 implementa los 4 core (status `live`); el resto queda `pending wave-N` con persona ya asignada.

## Resumen

- **Total**: 23 agent types
- **Wave 1 (live)**: 4 — R-code-quality, R-tests, R-mr-hygiene, R-triage
- **Wave 2 (pending)**: 17 — los 14 specialists originales + 2 nuevos (R-functional-completeness, R-regressions) + R-script-auditor + R-custom
- **Wave 3 (live, este ciclo)**: 1 — R-third-party-docs (Demetrio el Documentao); el resto de waves 3-5 amplían comportamientos sin añadir más agents

> Pattern de naming: `R-<concern>` (Reviewer-<concern>). Personas siguen el patrón "nombre español antiguo + mote ligado a la mecánica del agent".

## Especialistas (20)

| # | Agent | Persona | Concern | Status | Model | KB binding |
|---|---|---|---|---|---|---|
| 1 | `R-code-quality` | **Restituto Ojo-Fino** | Style + readability + TS/React rules | live (Wave 1) | sonnet | `_kb/code-quality.md` |
| 2 | `R-tests` | **Aniceto el Cenizo** | Calidad de specs + coverage gaps + test suggestions | live (Wave 1) | sonnet | `_kb/tests.md` |
| 3 | `R-mr-hygiene` | **Eustaquia la Histérica** | MR description, commits, env vars, secrets | live (Wave 1) | sonnet | `_kb/mr-hygiene.md` |
| 4 | `R-di` | **Crisanto el Jeringas** | functionInjection / objectInjection patterns | live (Wave 2) | sonnet | `_kb/di.md` |
| 5 | `R-mongo-aggs` | **Ceferino el Tuberías** | MongoDB aggregation pipelines | live (Wave 2) | sonnet | `_kb/mongo-aggs.md` |
| 6 | `R-mongo-queries` | **Hipólito el Óptimo** | Repository queries + index usage | live (Wave 2) | sonnet | `_kb/mongo-queries.md` |
| 7 | `R-apollo-cache` | **Apolonia Cachetera** | Apollo cache policy (fetchPolicy explícito) | live (Wave 2) | sonnet | `_kb/apollo-cache.md` |
| 8 | `R-monorepo` | **Saturnino el del Saco** | Cohesion y blast-radius en packages/modules/shared | live (Wave 2) | sonnet | `_kb/monorepo.md` |
| 9 | `R-infra-protect` | **Herminia Montamuros** | `prodProtection()`, IAM policy docs, resource protection | live (Wave 2) | sonnet | `_kb/infra-protect.md` |
| 10 | `R-gitlab-ci` | **Filomeno el Maquinista** | `.gitlab-ci.yml` + environment scope + manual gates | live (Wave 2) | sonnet | `_kb/gitlab-ci.md` |
| 11 | `R-event-types` | **Bonifacio el Pregonero** | Event-types module + AMQP consumer impact | live (Wave 2) | sonnet | `_kb/event-types.md` |
| 12 | `R-migrations` | **Leocadia Migratoria** | Migrations + revertibilidad | live (Wave 2) | sonnet | `_kb/migrations.md` |
| 13 | `R-security` | **Eulogia la Sombrilla** | Secrets, payment paths, OAuth, JWT, redsys/paypal | live (Wave 2) | sonnet | `_kb/security.md` |
| 14 | `R-perf-backend` | **Sinforoso el Liebre** | Latencia + overhead en handlers de cola y aggs | live (Wave 2) | sonnet | `_kb/perf-backend.md` |
| 15 | `R-perf-frontend` | **Casimiro el Pixelero** | Bundle size + `React.lazy` + dynamic `import()` | live (Wave 2) | sonnet | `_kb/perf-frontend.md` |
| 16 | `R-homogeneity` | **Carmina la Anteojos** | Consistencia con análogos existentes en repo | live (Wave 2) | sonnet | `_kb/homogeneity.md` |
| 17 | `R-solid` | **Enriqueta Doña Perfecta** | SOLID en clases/composiciones complejas | live (Wave 2) | sonnet | `_kb/solid.md` |
| 18 | `R-functional-completeness` | **Wenceslao el Notario** | Cruza ticket Jira con cambios — scope coverage | live (Wave 2, D23) | sonnet | `_kb/functional-completeness.md` |
| 19 | `R-regressions` | **Secundina Caravuelta** | Blast-radius callers/consumers + stale comments | live (Wave 2, D24) | sonnet | `_kb/regressions.md` |
| 20 | `R-third-party-docs` | **Demetrio el Documentao** | Conformance con doc oficial + obsolescencia (vendor APIs/SDKs/libs) | live (Wave 3) | sonnet | `_kb/third-party-docs.md` |

## Roles especiales (3)

| # | Agent | Persona | Concern | Status | Model | Notas |
|---|---|---|---|---|---|---|
| 21 | `R-custom` | **Pancracio el Manitas** | Generalist on-demand para concerns no previstos | live (Wave 2) | sonnet | Recibe el `concern_brief` por parámetro en el dispatch; persona adoptable si el brief la inyecta |
| 22 | `R-script-auditor` | **Raimunda la Portera** | Audita scripts ad-hoc generados por el orquestador | live (Wave 2) | haiku | One-shot; only `Read`; verdict APPROVED/NEEDS_HUMAN/REJECTED |
| 23 | `R-triage` | **Anselmo el Cuentagotas** | Dedupe + agrupación + matriz severity×outcome | live (Wave 1) | opus | Único con `Read` deshabilitado — todo vía MCP |

## Reglas de la persona (D25)

Cada agent lleva un bloque `## Persona` con:
- Nombre del personaje.
- 1-2 tics de estilo (voz reconocible).
- Una directiva de aplicación (cuándo aparece, cuándo se calla).

El cuerpo de los issues YAML sigue siendo seco y técnico (file:line / problema / fix / cita a regla). La persona aparece sólo en:
- (a) Campo `title` del issue — ligera teatralidad permitida (≤80 chars).
- (b) Cuando un comment se postee a GitLab — el agent puede prefijar **una sola línea** corta de apertura.

Reglas duras:
- Nunca añadir >1 línea de toque por comment.
- Nunca antes del `file:line`.
- Nunca emojis (la teatralidad es verbal, no gráfica) — excepción: triage puede usar 🔴🟠🟡 ya planeados para severity rendering.
- Substancia siempre primero. Si la persona estira el comment >10%, recortarla.

## Activación de specialists

El orquestador decide qué specialists activar según el diff. Wave 1 sólo usa la activación básica:

- `R-code-quality`: diff toca `.ts|.tsx|.js|.jsx`.
- `R-tests`: diff toca `*.spec.ts|*.test.ts|*.spec.tsx|*.test.tsx` OR cambios productivos sin spec.
- `R-mr-hygiene`: siempre activo.
- `R-triage`: siempre activo al final.

Wave 2 añadirá file-pattern matching declarativo (`activation.json` por agent) + scripts library para concerns más sutiles (Mongo pipelines, security touch, etc.).

## Roadmap por agente

| Agente | Wave que lo activa | Persona | KB binding |
|---|---|---|---|
| R-code-quality, R-tests, R-mr-hygiene, R-triage | 1 | ya |  Wave 0 baseline |
| R-di…R-solid (14 specialists) | 2 | ya en Wave 2 plan | Wave 0 baseline (5 con patrones, 9 vacíos pero estructurados) |
| R-functional-completeness, R-regressions | 2 | ya en Wave 2 plan | Wave 2 baseline vacío; poblar en próxima `RUN-ANALYSIS.md` pass |
| R-custom | 2 | n/a | El dispatch le inyecta el `kb-binding` |
| R-script-auditor | 2 | n/a | No usa KB; reglas de binary allowlist |
| R-third-party-docs | 3 | ya en Wave 3 | KB stub creado; requiere WebFetch + WebSearch (única exception en specialists) |

## Modificación del catálogo

Para añadir un agent nuevo:

1. Crea `agents/R-<concern>.md` con frontmatter + body (sigue la plantilla de un agent existente).
2. Crea `_kb/<concern>.md` (puede empezar vacío con frontmatter; poblar más adelante).
3. Añade entry en esta tabla + en `_kb/_index.md`.
4. Si necesita scripts dedicados, añade en `scripts/library/` (Wave 2).
5. Actualiza `commands/mr-review.md` con la regla de activación si no es trivial.

Para modificar persona/voz de un agent existente: edita SOLO el bloque `## Persona` del agent.md. El resto del prompt no debería tocar la persona — eso evita drift.
