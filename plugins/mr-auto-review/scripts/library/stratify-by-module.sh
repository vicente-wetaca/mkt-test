#!/usr/bin/env bash
# !script-id: stratify-by-module
# !purpose: Mapea cada fichero del diff a su workspace top-level (packages/, services/, modules/, frontend/, infra/, etc.)
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { modules: { "<top>": N }, totalFiles: N, distinctModules: N, files: [{ path, module }] }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output para decidir activación de specialists.
# Ej. si "modules.infra" > 0 → activa R-infra-protect; si "modules.frontend" > 0 → activa R-perf-frontend, etc.

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Extrae paths post-diff (línea "+++ b/<path>"). Salida limpia sin "b/".
FILES=$(grep "^+++ b/" "$PATCH_FILE" | awk '{print $2}' | sed 's|^b/||' || true)

# Para cada path, top-level dir es el primer segmento
echo "$FILES" | awk -F/ '
  $1 != "" { count[$1]++; print $0 "\t" $1 }
  END {
    n = 0
    for (m in count) n++
    printf "###MOD_COUNT###%d\n", n
    for (m in count) printf "###MOD###%s###%d\n", m, count[m]
  }
' > /tmp/_stratify_$$.tmp || true

# Parsea resultado a JSON
TOTAL_FILES=$(grep -v "^###" /tmp/_stratify_$$.tmp | grep -v "^$" | wc -l | awk '{print $1}')
DISTINCT=$(grep "^###MOD_COUNT###" /tmp/_stratify_$$.tmp | sed 's|^###MOD_COUNT###||')

MODULES_JSON=$(grep "^###MOD###" /tmp/_stratify_$$.tmp \
  | sed 's|^###MOD###||' \
  | awk -F'###' '{ printf "\"%s\": %s,", $1, $2 }' \
  | sed 's|,$||')

FILES_JSON=$(grep -v "^###" /tmp/_stratify_$$.tmp | grep -v "^$" \
  | awk -F'\t' '{ printf "{\"path\":\"%s\",\"module\":\"%s\"},", $1, $2 }' \
  | sed 's|,$||')

rm -f /tmp/_stratify_$$.tmp

cat <<EOF
{
  "modules": { $MODULES_JSON },
  "totalFiles": $TOTAL_FILES,
  "distinctModules": $DISTINCT,
  "files": [ $FILES_JSON ]
}
EOF
