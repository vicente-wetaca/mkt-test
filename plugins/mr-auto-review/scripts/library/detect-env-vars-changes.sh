#!/usr/bin/env bash
# !script-id: detect-env-vars-changes
# !purpose: Detecta cambios en env.ts/.env/.env.example y verifica consistencia (nuevas vars en env.ts deben estar en .env.example)
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { envFilesChanged: [path], newVarsInEnvTs: [name], newVarsInEnvExample: [name], inconsistent: [name] }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output: si inconsistent.length > 0, R-security
# y R-mr-hygiene lo flageen como must-fix (env.ts pide variable pero
# .env.example no la documenta = deploy roto en máquinas nuevas).

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Ficheros env tocados
ENV_FILES=$(grep "^+++ b/" "$PATCH_FILE" | awk '{print $2}' | sed 's|^b/||' \
  | grep -E '(env\.ts|\.env$|\.env\.example|\.env\.production|\.env\.development)' || true)

# Variables nuevas añadidas en env.ts (líneas añadidas que matchean str() / num() / bool() patterns de envalid)
NEW_IN_ENV_TS=$(awk '
  /^diff --git/ { file=""; in_envts=0; next }
  /^\+\+\+ b\// {
    sub(/^\+\+\+ b\//, "", $0)
    file=$0
    in_envts = (file ~ /env\.ts$/) ? 1 : 0
    next
  }
  in_envts && /^\+[^+]/ {
    snip = substr($0, 2)
    # envalid patterns: VAR_NAME: str(...), VAR_NAME: num(...), etc.
    if (match(snip, /([A-Z_][A-Z0-9_]+)[[:space:]]*:[[:space:]]*(str|num|bool|email|host|port|url|json)\(/)) {
      var_name = substr(snip, RSTART, RLENGTH)
      sub(/[[:space:]]*:.*$/, "", var_name)
      print var_name
    }
  }
' "$PATCH_FILE" | sort -u)

# Variables nuevas añadidas en .env.example (líneas añadidas KEY=...)
NEW_IN_ENV_EXAMPLE=$(awk '
  /^diff --git/ { file=""; in_example=0; next }
  /^\+\+\+ b\// {
    sub(/^\+\+\+ b\//, "", $0)
    file=$0
    in_example = (file ~ /\.env\.example/) ? 1 : 0
    next
  }
  in_example && /^\+[^+]/ {
    snip = substr($0, 2)
    if (match(snip, /^[A-Z_][A-Z0-9_]+=/)) {
      var_name = substr(snip, RSTART, RLENGTH-1)
      print var_name
    }
  }
' "$PATCH_FILE" | sort -u)

# Inconsistencias: variables en env.ts NO en .env.example
INCONSISTENT=$(comm -23 <(echo "$NEW_IN_ENV_TS") <(echo "$NEW_IN_ENV_EXAMPLE") | grep -v '^$' || true)

# Helpers JSON
to_json_array() {
  if [[ -z "$1" ]]; then
    echo "[]"
  else
    echo "[$(echo "$1" | awk 'NF { printf "\"%s\",", $0 }' | sed 's|,$||')]"
  fi
}

ENV_FILES_JSON=$(to_json_array "$ENV_FILES")
NEW_ENVTS_JSON=$(to_json_array "$NEW_IN_ENV_TS")
NEW_EXAMPLE_JSON=$(to_json_array "$NEW_IN_ENV_EXAMPLE")
INCONSISTENT_JSON=$(to_json_array "$INCONSISTENT")

cat <<EOF
{
  "envFilesChanged": $ENV_FILES_JSON,
  "newVarsInEnvTs": $NEW_ENVTS_JSON,
  "newVarsInEnvExample": $NEW_EXAMPLE_JSON,
  "inconsistent": $INCONSISTENT_JSON
}
EOF
