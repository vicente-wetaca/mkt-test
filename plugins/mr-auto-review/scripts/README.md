# MR-auto-review — Scripts

> Scripts bash que el orquestador y los reviewers utilizan en el pre-pass y en runtime. Divididos en **library** (versionados, pre-auditados) y **ad-hoc** (generados durante una review, auditados one-shot por `R-script-auditor`).

## Estructura

```
scripts/
├── README.md                 # Este fichero
├── BINARY-POLICY.md          # Política de binarios permitidos + protocolo humano
├── binary-policy.yml         # allowed / rejected / pending
├── library/                  # Scripts versionados (auditoría única al añadirse)
│   ├── _INDEX.md             # Catálogo + mapping concern → script
│   ├── compute-mr-size.sh
│   ├── stratify-by-module.sh
│   ├── detect-mongo-pipelines.sh
│   ├── detect-di-usage.sh
│   ├── detect-secrets-touch.sh
│   ├── detect-env-vars-changes.sh
│   ├── detect-react-lazy.sh
│   └── run-tests-summary.sh
└── _deprecated/              # Scripts retirados (referencia histórica)
```

Scripts ad-hoc viven en `.dev/MR-auto-review/<ticketId>/_scripts/` (gitignored) y se auditan en tiempo de ejecución por `R-script-auditor`.

## Reglas duras

- **NO se ejecuta un script sin auditoría**:
  - Library scripts → auditados una sola vez al añadirse (manual review del owner).
  - Ad-hoc → auditados por `R-script-auditor` en runtime; verdict APPROVED obligatorio.
- **Binarios sólo desde `binary-policy.yml.allowed`** — ver `BINARY-POLICY.md`.
- **Read-only**: los scripts NO mutan el filesystem del repo (excepción: ficheros temporales vía `mktemp`).
- **Sin network**: nada de `curl`, `wget`, `nc`, etc.
- **Header estandarizado obligatorio** en cada script library:
  ```bash
  # !script-id: <id-kebab>
  # !purpose: <1-line>
  # !inputs: <args + env vars>
  # !outputs: stdout JSON con schema declarado
  # !audited: YYYY-MM-DD (initial audit / re-audit, manual review by owner)
  # !version: SEMVER
  ```

## Workflow: añadir un script nuevo a la library

Caso de uso típico: durante un review, el orquestador genera un script ad-hoc que resulta útil y queremos reusarlo en futuros runs sin pasar por `R-script-auditor` cada vez.

### Procedimiento — manual

1. **Identifica el script ad-hoc útil**. Vive en `.dev/MR-auto-review/<ticketId>/_scripts/<id>.sh` con verdict APPROVED previo del auditor.

2. **Copia al library directory** preservando el contenido:
   ```bash
   cp .dev/MR-auto-review/<ticketId>/_scripts/<id>.sh \
      .claude/plugins/MR-auto-review/scripts/library/<id>.sh
   chmod +x .claude/plugins/MR-auto-review/scripts/library/<id>.sh
   ```

3. **Añade el header estandarizado** (si no lo tenía ya):
   ```bash
   # !script-id: <id-kebab>
   # !purpose: <propósito en 1 línea>
   # !inputs: <args y env vars que recibe>
   # !outputs: stdout JSON. Schema: { ... }
   # !audited: <YYYY-MM-DD> (initial audit, owner: <github-handle>)
   # !version: 1.0.0
   ```

4. **Manual audit por el owner del repo** (NO por agentes IA):
   - Verifica binarios usados vs `binary-policy.yml.allowed`.
   - Verifica que no muta filesystem ni hace network.
   - Verifica que paths leídos están dentro del workspace.
   - Confirma que el output JSON cumple un schema estable.

5. **Actualiza `library/_INDEX.md`** con la nueva entrada:
   - Fila en la tabla "Catálogo".
   - Si activa algún specialist, fila en "Mapping concern → script".
   - Audit log inicial (`PENDING` → `APPROVED` por el owner).

6. **Actualiza `commands/mr-review.md`** si el script debe ejecutarse en el pre-pass:
   - Añade fila en la tabla del Paso 2.2.
   - Añade criterio de activación de specialist correspondiente en Paso 4 si aplica.

7. **Commit** con mensaje claro:
   ```
   WET-XXXX: add <id> to scripts library

   Promoción de script ad-hoc utilizado en <ticket-original>. Output:
   <schema breve>. Activa <specialist> cuando count > 0.
   ```

### Procedimiento — vía comando del plugin (futuro, Wave 4+)

`[wave-4+]` El plan de Wave 4 incluye implementar un comando dedicado:

```
/mr-review-kb promote-script <fileId>
```

Que automatizaría los pasos 2-6:

- Copiar el fichero del workspace al `library/`.
- Aplicar/validar el header.
- Ejecutar `R-script-auditor` UNA VEZ con la marca `final_audit: true` para diferenciarlo de la auditoría de ad-hoc (verdict APPROVED requerido).
- Generar el diff para `_INDEX.md` y `commands/mr-review.md`.
- Dejar todo staged listo para commit del owner.

Hasta que Wave 4 entregue esto, el procedimiento manual aplica.

## Workflow: deprecar un script de la library

1. **Mueve a `_deprecated/`** preservando contenido:
   ```bash
   mkdir -p .claude/plugins/MR-auto-review/scripts/_deprecated
   git mv .claude/plugins/MR-auto-review/scripts/library/<id>.sh \
          .claude/plugins/MR-auto-review/scripts/_deprecated/<id>.sh
   ```

2. **Añade marca `!deprecated` al header**:
   ```bash
   # !deprecated: <YYYY-MM-DD> (reason: <breve>)
   ```

3. **Elimina la entrada** de `library/_INDEX.md` (catálogo + mapping).

4. **Quita activaciones** dependientes en `commands/mr-review.md`.

5. **Commit**:
   ```
   WET-XXXX: deprecate <id> from scripts library

   Razón: <breve>. Si algún specialist dependía de él, su activación
   se modifica para usar <alternativa> o se simplifica.
   ```

## Workflow: modificar un script existente

1. Edita el fichero en `library/<id>.sh`.
2. Bumpa `!version` (semver: PATCH para bugfix, MINOR para feature, MAJOR para breaking change del output schema).
3. Actualiza `!audited` con la nueva fecha si cambia algo material (no para typos en comentarios).
4. Re-auditar manualmente — el owner repasa el diff.
5. Si el output schema cambió (MAJOR), actualizar cualquier specialist que lo consuma y el mapping en `_INDEX.md`.
6. Commit con mensaje describiendo el bump.

## Cómo escribir un script library bien hecho

Patrón observado en los scripts existentes:

```bash
#!/usr/bin/env bash
# !script-id: my-script
# !purpose: ...
# !inputs: $1 (path), $2 (base ref opcional)
# !outputs: stdout JSON. Schema: { ... }
# !audited: 2026-05-20
# !version: 1.0.0
#
# Una nota breve adicional si la implementación tiene detalles no obvios.

set -euo pipefail

# Defaults seguros
ARG1="${1:-}"
ARG2="${2:-master}"

# Validación temprana
if [[ -z "$ARG1" || ! -f "$ARG1" ]]; then
  # genera tempfile o aborta con error descriptivo
fi

# Procesamiento con awk/jq — preferir jq para JSON output
RESULT=$(... | jq '...')

# Output JSON al stdout (NO escribir a ficheros del repo)
echo "$RESULT"
```

Principios:

- `set -euo pipefail` siempre.
- `mktemp` con `trap 'rm -f "$TMP"' EXIT` para tempfiles.
- Validación temprana de inputs.
- Output JSON al stdout (el orquestador captura y persiste vía `mr_write`).
- Sin redirecciones a paths del repo.
- Sin llamadas de red.
- Sólo binarios en `binary-policy.yml.allowed`.
- Idempotente: ejecutar dos veces produce el mismo output.

## Troubleshooting

| Síntoma | Posible causa | Cómo verificar |
|---|---|---|
| Script muere con "permission denied" | Falta `chmod +x` | `ls -la <script>.sh` debe mostrar `-rwxr-xr-x` |
| JSON output malformed | escape de comillas / sed reemplazando comas | Pipear a `jq '.'` para validar |
| awk "illegal primary in regex" | `\$` o `\(` no funcionan en awk regex | Sustituir por `[$]`, `[(]`, etc. |
| Script tarda >5 min | Falta cap o `find` sin limit | Añadir `gtimeout` (GNU coreutils en mac) o `timeout` (linux) |
| Binario "not in allowlist" | Script usa binario fuera de `binary-policy.yml` | Pasar por R-script-auditor → decisión humana |
