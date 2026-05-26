#!/usr/bin/env bash
# !script-id: detect-mongo-pipelines
# !purpose: Detecta uso de aggregation pipelines en el diff (operators $match/$group/$lookup/$unwind/.aggregate())
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { pipelinesFound: [{file, line, snippet}], count: N }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output: si count > 0, activa R-mongo-aggs.
# Sólo flagea líneas añadidas (+) del diff, no eliminadas; el reviewer
# verá pipelines tocados o introducidos por el MR.

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Pattern para operators de aggregation
# Nota: awk no acepta \$ como literal $ en regex — uso [$] que es portable
PATTERN='[$]match|[$]group|[$]lookup|[$]unwind|[$]project|[$]addFields|[$]bucket|[$]facet|[.]aggregate[(]'

# Parseo: walk del patch, mantengo el fichero actual y la línea actual
TMP_OUT=$(mktemp)
trap 'rm -f "$TMP_OUT"' EXIT

awk -v pat="$PATTERN" '
  /^diff --git/ { file=""; next }
  /^\+\+\+ b\// { sub(/^\+\+\+ b\//, "", $0); file=$0; line=0; next }
  /^@@/ {
    # Formato: @@ -old,n +new,m @@
    # Extrae la primera línea del lado nuevo
    if (match($0, /\+([0-9]+)/)) {
      line = substr($0, RSTART+1, RLENGTH-1) + 0 - 1
    }
    next
  }
  /^\+[^+]/ {
    line++
    snip = substr($0, 2)
    if (snip ~ pat) {
      # Escape comillas dobles y backslashes para JSON
      gsub(/\\/, "\\\\", snip)
      gsub(/"/, "\\\"", snip)
      gsub(/\t/, " ", snip)
      printf "{\"file\":\"%s\",\"line\":%d,\"snippet\":\"%s\"},\n", file, line, snip
    }
    next
  }
  /^[^-]/ {
    if (!/^\+/) line++
  }
' "$PATCH_FILE" > "$TMP_OUT"

# Cuenta y junta
COUNT=$(wc -l < "$TMP_OUT" | awk '{print $1}')
# Junta todas las líneas (cada una ya termina en `,`) y elimina la coma final
JSON_ITEMS=$(tr -d '\n' < "$TMP_OUT" | sed 's|,$||')

cat <<EOF
{
  "pipelinesFound": [ $JSON_ITEMS ],
  "count": $COUNT
}
EOF
