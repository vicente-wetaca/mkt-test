#!/usr/bin/env bash
# !script-id: detect-react-lazy
# !purpose: Detecta uso de React.lazy / dynamic import() en líneas añadidas del diff
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { lazyUsage: [{file, line, snippet, kind: "React.lazy"|"dynamic-import"}], count: N }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output: si count > 0, activa R-perf-frontend.
# Excluye 'import()' que claramente NO es dinámico (sólo si va precedido
# de await/then/return o similar).

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Pattern: React.lazy( o import( en contexto dinámico (precedido de await/return/then o asignación a lazy)
# Nota: evito quote-mixing en bash single-quote — uso patrones simples que awk parsea sin problemas
PATTERN='React[.]lazy[(]|= *lazy[(]|await +import[(]|then[(]|return +import[(]|=> *import[(]'

TMP_OUT=$(mktemp)
trap 'rm -f "$TMP_OUT"' EXIT

awk -v pat="$PATTERN" '
  /^diff --git/ { file=""; next }
  /^\+\+\+ b\// { sub(/^\+\+\+ b\//, "", $0); file=$0; line=0; next }
  /^@@/ {
    if (match($0, /\+([0-9]+)/)) {
      line = substr($0, RSTART+1, RLENGTH-1) + 0 - 1
    }
    next
  }
  /^\+[^+]/ {
    line++
    snip = substr($0, 2)
    if (snip ~ pat) {
      gsub(/\\/, "\\\\", snip)
      gsub(/"/, "\\\"", snip)
      gsub(/\t/, " ", snip)
      kind = (snip ~ /React\.lazy|=[[:space:]]*lazy\(/) ? "React.lazy" : "dynamic-import"
      printf "{\"file\":\"%s\",\"line\":%d,\"snippet\":\"%s\",\"kind\":\"%s\"},\n", file, line, snip, kind
    }
    next
  }
  /^[^-]/ {
    if (!/^\+/) line++
  }
' "$PATCH_FILE" > "$TMP_OUT"

COUNT=$(wc -l < "$TMP_OUT" | awk '{print $1}')
# Junta todas las líneas (cada una ya termina en `,`) y elimina la coma final
JSON_ITEMS=$(tr -d '\n' < "$TMP_OUT" | sed 's|,$||')

cat <<EOF
{
  "lazyUsage": [ $JSON_ITEMS ],
  "count": $COUNT
}
EOF
