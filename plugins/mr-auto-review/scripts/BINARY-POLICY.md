# Binary Allowlist Policy

> Política de binarios permitidos en scripts del plugin `mr-auto-review` (D19).
> Protocolo de **request humano** para binarios no listados.
> Persistencia de **rechazos** con razón para que el orquestador no vuelva a pedirlos.

## Por qué existe esta política

Los scripts (library + ad-hoc generados por el orquestador) ejecutan binarios shell. Sin restricciones, un script puede:

- Escribir/borrar ficheros (`rm`, `mv`, `cp`, `sed -i`).
- Hacer llamadas de red (`curl`, `wget`, `nc`, `ssh`).
- Mover datos sensibles fuera del workspace.
- Consumir binarios que el equipo no ha auditado.

La allowlist limita el conjunto de tools a un núcleo conocido + read-only + portable. Los binarios añadidos requieren aprobación humana explícita, persistida para auditoría.

## Fichero canónico

`binary-policy.yml` (en este mismo directorio) contiene 3 secciones:

| Sección | Contenido | Uso |
|---|---|---|
| `allowed` | binarios verdes | scripts pueden usarlos sin pedir |
| `rejected` | binarios bloqueados por el humano | si un script los usa → verdict AUTO `REJECTED`; NO se vuelve a pedir |
| `pending` | binarios solicitados pendientes | el orquestador presenta la solicitud al humano |

## Cómo funciona el flujo

```
┌────────────────────────────────────────────────────────────┐
│ Orquestador genera un script ad-hoc                       │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────┐
│ R-script-auditor (Haiku, sólo Read) analiza el script     │
│ - Detecta binarios usados                                  │
│ - Cross-check vs `binary-policy.yml`                       │
└────────────────────────────────────────────────────────────┘
            │                       │                  │
   todos en `allowed`       binario nuevo       binario en `rejected`
            ▼                       ▼                  ▼
┌────────────────┐  ┌────────────────────────┐  ┌────────────────────┐
│ verdict APPROVED│  │ verdict NEEDS_HUMAN  │  │ verdict REJECTED  │
│ → script corre  │  │ → añade a `pending`  │  │ → orquestador NO  │
│                 │  │ → orquestador pausa  │  │   lo solicita    │
│                 │  │   pre-pass + pide al │  │   de nuevo;       │
│                 │  │   humano             │  │   re-genera script │
└────────────────┘  └────────────────────────┘  └────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        permitir         rechazar          reescribir
              │               │                │
              ▼               ▼                ▼
       mueve a         mueve a          orquestador
       `allowed`       `rejected`       modifica script
                       con razón        y re-audita
```

## Protocolo de request humano

Cuando un script genera necesita un binario NO en `allowed` ni `rejected`:

1. El orquestador añade la entrada a `binary-policy.yml.pending`:
   ```yaml
   pending:
     - name: xargs
       requested_by: detect-bulk-imports.sh
       reason: "Necesario para procesar lista grande de paths en batches"
       requested_at: "2026-05-20"
   ```

2. El orquestador pausa el pre-pass y presenta al humano:
   ```
   Script `detect-bulk-imports.sh` quiere usar el binario `xargs` para:
     "Necesario para procesar lista grande de paths en batches"

   ¿Qué hacer?
     (1) Permitir → mueve a allowed, el script continúa
     (2) Rechazar → exige razón, persiste en rejected
     (3) Reescribir → da instrucciones para que el script use otra approach
   ```

3. Respuesta del humano:
   - **Permitir**: el orquestador mueve la entrada a `allowed` con `notes: "approved by <owner> on <date>"` y re-audita.
   - **Rechazar**: exige razón corta. Persiste en `rejected` con `reason`, `rejected_by`, `rejected_at`. El orquestador rehace el script con otra approach o aborta esa detección concreta.
   - **Reescribir**: el humano sugiere cambio; el orquestador modifica el script y vuelve a auditarlo.

4. Tras la decisión, la entrada se quita de `pending`.

## Reglas duras

- **NO se ejecuta un script sin haber pasado por R-script-auditor** (excepto los de `scripts/library/` que se auditan una sola vez al añadirlos a la library — Wave 2.7 promote workflow).
- **Si está en `rejected` → verdict automático REJECTED sin re-preguntar al humano**. Aprendizaje acumulativo: lo rechazado queda rechazado a menos que el humano EDITE `binary-policy.yml` manualmente.
- **Subcommandos restringidos**: para binarios como `git` o `yarn`, sólo subcommandos read-only / declarados en `constraints` son válidos. Ej: `git diff` ✓, `git push` ✗.
- **NO flags destructivos**: `sed -i`, `find -delete`, `find -exec rm`, `rm`, `rmdir`, `unlink`, `shred`, `dd if=`, `mkfs`, `chmod 777`, `chown` son SIEMPRE rechazables independientemente del binario.
- **NO llamadas de red**: `curl`, `wget`, `nc`, `ssh`, `rsync`, `scp`, `ftp` son SIEMPRE rechazables (el plugin trabaja con datos locales del repo + workspace).

## Cómo el auditor lee la política

`R-script-auditor` (Wave 2.3 agent) lee este YAML, identifica binarios en el script bajo análisis (parseando lines `^\s*<bin>` o pipelines `| <bin>` o `$(<bin>)` o `\`<bin>\``), y emite verdict por script:

```yaml
script: _scripts/ad-hoc-detect-imports.sh
binaries_used: [grep, awk, xargs]
verdict: NEEDS_HUMAN
reason: |
  `xargs` no está en allowed ni rejected. Se ha añadido a pending.
```

## Por qué el aprendizaje persiste

Si el humano rechaza `nc` con razón "llamada de red — no autorizada", esa decisión se mantiene para SIEMPRE (a menos que se edite el YAML manualmente). El próximo script que intente usar `nc`:

1. Auditor detecta `nc` en el script.
2. Cross-check: `nc` está en `rejected`.
3. Verdict AUTO `REJECTED` con la razón persistida.
4. Orquestador rehace el script sin `nc` o aborta esa detección.

Esto previene el ping-pong de "¿puedo usar X?" entre el orquestador y el humano.

## Cómo añadir / quitar entradas manualmente

Editar `binary-policy.yml` directamente. Las secciones son listas YAML; commitar el cambio con un mensaje claro (`WET-XXXX: allow <bin> for <script>` o `WET-XXXX: reject <bin> — <reason>`).

El auditor lee el fichero en cada invocación; no hay caché.

## Constraints de subcommando

Cuando un binario tiene `constraints`, el auditor también valida los args. Ejemplo `yarn`:

```yaml
- name: yarn
  notes: "..."
  constraints:
    - "ONLY subcommand: jest"
    - "MUST include --json"
    - "NO `yarn add` / `yarn install` / `yarn build` / mutations del workspace"
```

Si el script tiene `yarn install` → verdict REJECTED (`yarn install` muta `node_modules/`, no es read-only).
Si el script tiene `yarn jest` SIN `--json` → verdict REJECTED (output crudo gigante, fuera del contrato del script).
