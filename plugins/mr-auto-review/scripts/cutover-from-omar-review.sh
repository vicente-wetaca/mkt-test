#!/usr/bin/env bash
# Cutover desde omar-review hacia mr-auto-review.
# Hace backup del skill viejo a .dev/legacy/ y verifica que el plugin nuevo
# está cargado. NO toca el skill viejo automáticamente — sólo lo respalda
# para que el humano lo borre manualmente cuando esté seguro del cutover.
#
# Spec: Wave 5 (cutover). Idempotente: si el backup ya existe, no falla.

set -euo pipefail

OMAR_PATH="${HOME}/.claude/skills/omar-review"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TODAY=$(date +%Y%m%d)
BACKUP_DIR="${REPO_ROOT}/.dev/legacy/omar-review-${TODAY}"
PLUGIN_PATH="${REPO_ROOT}/.claude/plugins/MR-auto-review"

# -- Comprobaciones previas
echo "==> Cutover desde omar-review hacia mr-auto-review"
echo "    Repo root:    ${REPO_ROOT}"
echo "    Omar path:    ${OMAR_PATH}"
echo "    Backup dest:  ${BACKUP_DIR}"
echo "    Plugin path:  ${PLUGIN_PATH}"
echo ""

if [[ ! -d "${PLUGIN_PATH}" ]]; then
  echo "ERROR: el plugin mr-auto-review no existe en ${PLUGIN_PATH}." >&2
  echo "       Aborta: el cutover requiere el plugin nuevo ya instalado." >&2
  exit 1
fi

if [[ ! -d "${OMAR_PATH}" ]]; then
  echo "INFO: omar-review NO está instalado en ${OMAR_PATH}."
  echo "      Nada que respaldar. Considera el cutover ya completado."
  exit 0
fi

# -- Backup
mkdir -p "${REPO_ROOT}/.dev/legacy"

if [[ -d "${BACKUP_DIR}" ]]; then
  echo "INFO: backup ya existe en ${BACKUP_DIR} (idempotencia OK)."
else
  echo "==> Copiando ${OMAR_PATH} a ${BACKUP_DIR}..."
  cp -R "${OMAR_PATH}" "${BACKUP_DIR}"
  echo "    OK"
fi

# -- Marker file
MARKER="${BACKUP_DIR}/CUTOVER.md"
if [[ ! -f "${MARKER}" ]]; then
  cat > "${MARKER}" <<EOF
# omar-review backup (cutover hacia mr-auto-review)

Backup creado por \`scripts/cutover-from-omar-review.sh\` el ${TODAY}.

## Qué es este directorio

Copia íntegra del skill \`~/.claude/skills/omar-review/\` justo antes del
cutover hacia el plugin \`mr-auto-review\`. Se preserva para auditoría y
para poder revertir si la validación de las 6 MRs reales (ver
\`docs/MIGRATION.md\` y \`docs/SIX-MR-CHECKLIST.md\`) detectara
regresiones críticas.

## Cómo revertir

1. Verifica que el plugin nuevo NO está postenado comments en MRs activas.
2. Restaura el skill:
   \`\`\`
   rm -rf ~/.claude/skills/omar-review
   cp -R ${BACKUP_DIR} ~/.claude/skills/omar-review
   \`\`\`
3. (Opcional) Desactiva el plugin via /plugin del marketplace.

## Cómo retirar definitivamente omar-review

Cuando las 6 MRs reales pasen la validación (ver SIX-MR-CHECKLIST.md):

   \`\`\`
   rm -rf ~/.claude/skills/omar-review
   \`\`\`

Mantener este backup en \`.dev/legacy/\` indefinidamente. \`.dev/\` está
gitignored, así que no ocupa espacio en remote.
EOF
  echo "==> Marker file escrito en ${MARKER}"
fi

# -- Resumen
echo ""
echo "==> Cutover backup completado."
echo "    Para retirar omar-review tras la validación de 6 MRs:"
echo "    rm -rf ${OMAR_PATH}"
echo ""
echo "    Para revertir el cutover:"
echo "    rm -rf ${OMAR_PATH} && cp -R ${BACKUP_DIR} ${OMAR_PATH}"
echo ""
echo "    Siguiente paso: validar el plugin con 6 MRs reales —"
echo "    docs/SIX-MR-CHECKLIST.md"
