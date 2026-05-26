#!/usr/bin/env bash
# !script-id: detect-secrets-touch
# !purpose: Detecta keywords sensibles (token, secret, jwt, password, oauth, redsys, paypal, stripe, hash, bcrypt) en líneas añadidas. Excluye keywords benignas (passwordReset, hashedId)
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { secretsTouched: [{file, line, snippet, keyword}], count: N }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output: si count > 0, activa R-security.
# Allowlist incluida para evitar falsos positivos comunes (passwordReset,
# resetPasswordToken, hashedId, hashCode son strings legítimos).

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Keywords sensibles (case-insensitive)
PATTERN='[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN]|[jJ][wW][tT]|[pP][aA][sS][sS][wW][oO][rR][dD]|[oO][aA][uU][tT][hH]|[rR][eE][dD][sS][yY][sS]|[pP][aA][yY][pP][aA][lL]|[sS][tT][rR][iI][pP][eE]_[sS][kK]|sk_live_|whsec_|glpat-|[bB][cC][rR][yY][pP][tT]'

# Allowlist: si la línea matchea ESTOS strings, NO se reporta (falsos positivos)
# Nota: awk no acepta \( como literal ( — uso [(] que es portable
ALLOWLIST='passwordReset|resetPasswordToken|hashedId|hashCode|stripeCustomerId|stripeProductId|paypalOrderId|tokenize[(]|tokenizationKey|csrfToken'

TMP_OUT=$(mktemp)
trap 'rm -f "$TMP_OUT"' EXIT

awk -v pat="$PATTERN" -v allow="$ALLOWLIST" '
  /^diff --git/ { file=""; in_doc=0; next }
  /^\+\+\+ b\// {
    sub(/^\+\+\+ b\//, "", $0)
    file=$0
    line=0
    # Skip ficheros de documentación (.md, .txt, .rst, .yaml frontmatter) — no son código de producción
    in_doc = (file ~ /[.](md|txt|rst|adoc)$/) ? 1 : 0
    next
  }
  /^@@/ {
    if (match($0, /\+([0-9]+)/)) {
      line = substr($0, RSTART+1, RLENGTH-1) + 0 - 1
    }
    next
  }
  /^\+[^+]/ {
    line++
    if (in_doc) next
    snip = substr($0, 2)
    if (snip ~ pat && !(snip ~ allow)) {
      # Detecta keyword especifico (primer match)
      keyword = "unknown"
      if (match(tolower(snip), /secret|token|jwt|password|oauth|redsys|paypal|bcrypt|sk_live_|whsec_|glpat-/)) {
        keyword = substr(tolower(snip), RSTART, RLENGTH)
      }
      gsub(/\\/, "\\\\", snip)
      gsub(/"/, "\\\"", snip)
      gsub(/\t/, " ", snip)
      printf "{\"file\":\"%s\",\"line\":%d,\"snippet\":\"%s\",\"keyword\":\"%s\"},\n", file, line, snip, keyword
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
  "secretsTouched": [ $JSON_ITEMS ],
  "count": $COUNT
}
EOF
