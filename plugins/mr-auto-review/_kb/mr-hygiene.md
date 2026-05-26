# KB: mr-hygiene

| Field | Value |
|---|---|
| concern | mr-hygiene |
| last_updated | 2026-05-21 |
| corpus_size | 39 |
| methodology_version | 1 |

## Reglas duras (citas a `.claude/rules/*.md`)

- `.dev/_docs/Tasks/__MANAGEMENT/plantilla.md` — plantilla canónica del MR description (Objetivos / What and why / Pruebas / Enlaces).
- Convención de naming de ramas Wetaca (regla DEL EQUIPO, simple): `{tipo}/WET-####-{texto-libre}` donde `tipo ∈ {feature, bugfix, test, hotfix}`. Separador entre la key y el texto es **un guión simple**. El doble guión (`WET-####--texto`) es preferencia personal de algún miembro del equipo, NO convención. Ver feedback memory `feedback-wetaca-branch-naming` para detalle.

## Patrones blandos (heurísticas observadas en revisiones humanas)

*(no recurring patterns extracted yet — increase corpus size or relax threshold)*

## Anti-patrones a flaggar

- **MR description vacía** — incluso en hotfixes mínimos se espera ≥ 3 líneas de contexto (qué cambia, por qué era incorrecto, nota de verificación). Severidad típica: `should-fix`.
- **Typos en título del MR** — los títulos quedan en historial inmutable. Severidad típica: `nit`.
- **WET-#### ausente en título Y rama de cambios `feature/` o `bugfix/`** — bloquea el cruce automático con Jira. Severidad típica: `should-fix`. **Excepción**: hotfixes pequeños (ver sección "Excepciones").

## Falsos positivos comunes (NO flaggar)

- **Guión simple vs doble entre `WET-####` y el resto del slug**: la regla del equipo Wetaca acepta `WET-####-texto-libre` (guión simple). `WET-####--texto` es preferencia personal, no convención. NO emitir issue sobre el separador. Para parsear la key Jira desde un nombre de rama, usar `regex WET-\d+` (no presuponer delimitador concreto).
- **Idioma del título del MR**: el equipo mezcla español e inglés según el contexto. NO flaggear por preferencia lingüística.
- **`Closes WET-####` como única línea de la description en hotfixes pequeños** — ver excepción de hotfix más abajo.

## Excepciones (NO flaggar como hygiene issues)

### Hotfixes pequeños sin ticket Jira

**Regla**: Una rama que cumple TODAS estas condiciones se considera "hotfix pequeño" y NO requiere WET-#### en título ni en branch name. Tampoco requiere description con la plantilla completa.

Condiciones (AND, todas):
- Branch name empieza por `hotfix/` (NO `feature/` ni `bugfix/`).
- Diff ≤ **3 ficheros** Y ≤ **30 líneas añadidas** (per `compute-mr-size.json`).
- Cambio es de tipo "literal config": URL, env value, version pin, hostname, secret rotation, link roto, dominio CSP. Sin código TypeScript/JavaScript productivo, sin lógica de negocio, sin migraciones.

**Por qué**: convención de equipo Wetaca confirmada 2026-05-21 (validación MR !3760, hotfix de link Instagram DE — mergeado sin ticket y aprobado por reviewer humano sin observación). Los hotfixes urgentes priorizan velocidad sobre trazabilidad formal. Crear un ticket Jira ad-hoc por cada cambio de 1 línea genera ruido más que valor.

**Acción del reviewer cuando se cumple la excepción**:
- NO emitir `g-001` / `should-fix` por ausencia de WET-#### en título ni rama.
- NO emitir `should-fix` por description vacía (un nit informativo es aceptable si quieres dejar registro, pero NO debe ir a `outcome: publish`; usa `outcome: follow-up` o `outcome: noted`).
- SÍ flaggar typos (`Alemenia` → `Alemania`) como `nit` con `publish` — son cosméticos, baratos de corregir, y mejoran el historial.

**Cuando NO aplica la excepción**:
- `feature/*` o `bugfix/*` — siempre requieren WET-####, incluso si son pequeños.
- `hotfix/*` que toca código productivo (TS/JS) o lógica de negocio.
- Diff > 30 líneas o > 3 ficheros — el cambio ya no es "literal config", entra en régimen normal.

## Cómo regenerar este fichero

Ver `_methodology/RUN-ANALYSIS.md`.
