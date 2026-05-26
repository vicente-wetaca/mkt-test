---
name: mr-review-resume
description: "Continúa una ejecución de /mr-review interrumpida (cost cap, ctrl-C, crash) retomando desde el último checkpoint. Use as: /mr-review-resume [--ticketId <WET-####>|--mr <iid>]."
---

# /mr-review-resume — Retomar review interrumpida

Eres el **main agent**. Tu trabajo es leer el último checkpoint persistido por el orquestador `/mr-review` y retomar desde ahí, **NO** re-correr lo que ya está hecho.

> **Estado actual del soporte**: la lectura del `orchestrator-state.yml` está implementada aquí. La **escritura de checkpoints** desde `/mr-review` queda como trabajo de Wave 4 (hardening). Hasta entonces, este comando puede leer el formato esperado y reportar qué fase quedó pendiente, pero NO encadena con un orquestador que escriba state en cada paso — `mr-review` v3.x lo persiste sólo en los puntos críticos (tras el dispatch de specialists y tras el triage).

---

## Argumentos

| Flag | Default | Efecto |
|---|---|---|
| `--ticketId <WET-####>` | autodetect del branch | Workspace cuyo state se inspecciona |
| `--mr <iid>` | off | Override del MR IID (modo remote) |
| `--from-step <N>` | autodetect del state | Fuerza retomada desde una fase concreta (`pre-pass`, `dispatch`, `triage`, `selection`, `posting`, `jira`). Útil si el humano quiere repetir una fase |

---

## Formato canónico de `orchestrator-state.yml`

El orquestador `/mr-review` debería escribir este fichero tras CADA paso significativo (vía `mr_overwrite`). Ubicación: `_state/orchestrator-state.yml`.

```yaml
ticketId: WET-4814
mode: remote               # local | remote
mr_iid: 3802               # null si local
last_step: triage          # pre-pass | dispatch | run-tests | triage | selection | dedup | hard-cap | posting | marker | jira | done
last_step_completed_at: 2026-05-20T15:00:00Z

# Estado por fase
phases:
  pre_pass:
    completed_at: 2026-05-20T14:30:00Z
    bucket: MEDIUM
    files_changed: 23
    detect_signals:
      mongo_pipelines: 0
      di_usage: 4
      secrets_touch: 0
      react_lazy: 2
  dispatch:
    completed_at: 2026-05-20T14:50:00Z
    specialists_dispatched: [R-code-quality, R-tests, R-mr-hygiene, R-di, R-third-party-docs]
    specialists_finished: [R-code-quality, R-tests, R-mr-hygiene, R-di, R-third-party-docs]
    issues_emitted_total: 14
  triage:
    completed_at: 2026-05-20T15:00:00Z
    groups: 9
    severity_counts: { must-fix: 2, should-fix: 5, nit: 2 }
    outcome_counts:  { publish: 6, follow-up: 2, reject: 1 }
  selection:
    completed_at: null   # null = pendiente
  posting:
    completed_at: null
  marker:
    completed_at: null
  jira:
    completed_at: null

# Cost tracking
tokens_spent: 184320
cost_estimate_usd: 1.85
```

---

## Pasos

1. **Resolver ticketId** (igual que `/mr-review-status`).

2. **Cargar state**: `mr_read(ticketId, fileId="_state/orchestrator-state.yml")`. Si no existe → "No hay state guardado para <ticketId>. Ejecuta /mr-review desde cero." y termina.

3. **Identificar la siguiente fase pendiente**. Mira el primer `completed_at: null` en `phases`. Si todas están completadas o `last_step == done` → "La review ya terminó. Usa /mr-review-status para ver el resumen." y termina.

4. **Validar pre-condiciones de la fase**:
   - `selection`: requiere que `triage.completed_at` esté presente y los reports estén en el workspace.
   - `posting`: requiere `selection.completed_at` Y `mode == remote` Y SHA actual del MR ≡ `phases.pre_pass.head_sha`. Si SHA mismatch → aborta con el mismo flujo de Paso 10.quater del orquestador.
   - `jira`: requiere `triage.completed_at` (independiente del posting — Jira corre tras posting o tras selection en modo local).

5. **Si `--from-step` se pasó**:
   - Verifica que la fase exista. Si no → error.
   - Trata todas las fases ≥ a esa como pendientes (sobrescribe `completed_at: null`).
   - Notifica al humano: "Forzando retomada desde `<from-step>` — fases posteriores se re-ejecutarán."

6. **Despacha el orquestador desde el paso correspondiente** delegando a `/mr-review` con un flag interno `--resume-from <step>` (no documentado al usuario; uso interno del comando):
   - Si el siguiente paso es `selection` → entra al Paso 10 del orquestador con triage ya en disco.
   - Si es `posting` → entra al Paso 10.quater.
   - Si es `jira` → entra al Paso 10.quinquies.
   - Si es `marker` → postea el marker (lectura de los contadores ya persistidos en `posting`).

7. **Tras cada paso completado**, escribe `phases.<step>.completed_at` y persiste vía `mr_overwrite`.

---

## Hard rules

- **No re-ejecutes pre_pass ni dispatch ni triage** si están marcados completados — el coste de re-correr es alto y los outputs ya están en disco.
- **Sí re-ejecuta selection / posting / jira** si el humano lo pide explícitamente con `--from-step`. El gate humano de cada uno se vuelve a aplicar (siempre).
- **Si el state está malformado** (YAML inválido, campos críticos faltantes) → reporta el error y NO intentes adivinar. Sugiere correr `/mr-review` desde cero.
- **El state se preserva tras el resume**. NO lo borres al terminar — sirve de auditoría para la run completa.
- **No tocar GitLab ni Jira durante la lectura del state**. Esas acciones suceden sólo cuando entras en la fase correspondiente con su propio gate humano.

---

## Limitación conocida (Wave 3.G)

El orquestador `/mr-review` v3.G **NO escribe `orchestrator-state.yml` en todos los pasos**. Hasta que Wave 4 (hardening) añada los checkpoint-writes en cada fase, `/mr-review-resume` puede:
- **Leer** state que tú escribas manualmente o que el orquestador escriba en un punto concreto (ej. tras el triage, antes del gate humano).
- **No** recuperarse limpiamente de un crash en mitad del dispatch o mitad del posting — el state no fue persistido.

Por ahora trata `/mr-review-resume` como un comando útil para:
- Re-ejecutar `selection` o `posting` tras una pausa larga sin re-correr el triage.
- Re-correr `jira` tras un fallo del MCP de Atlassian.

Las recuperaciones de crash más complejas llegan en Wave 4.
