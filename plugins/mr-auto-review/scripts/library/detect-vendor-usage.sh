#!/usr/bin/env bash
# !script-id: detect-vendor-usage
# !purpose: Detecta cambios en dependencias de terceros — package.json/lockfiles tocados, imports nuevos desde paquetes externos, y líneas añadidas que usan paquetes ya importados (heurístico). El análisis fino lo hace R-third-party-docs (Demetrio el Documentao).
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master"); opcional $3 (path al repo root, default cwd)
# !outputs: stdout JSON. Schema:
#   {
#     packageJsonChanged: [<relative path>, ...],
#     lockfileChanged: [<relative path>, ...],
#     newImports: [{file, line, package, kind}],         # kind: import | require
#     modifiedUsageCandidates: [{file, line, package}],  # líneas añadidas que mencionan un paquete instalado
#     externalPackages: [<package>, ...],                # paquetes externos detectados en root package.json
#     count: N
#   }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El orquestador usa este output: si count > 0 (o packageJsonChanged no-vacío),
# activa R-third-party-docs. Demetrio recibe `newImports` + `modifiedUsageCandidates`
# como puntos de partida; verifica conformance via doc oficial del vendor.
#
# Limitación: `modifiedUsageCandidates` es heurístico — matchea por nombre de
# paquete contra TODA línea añadida (no diferencia uso real vs comentario/string).
# Esto es por diseño: el análisis fino lo hace el agent leyendo el código real.

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"
REPO_ROOT="${3:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# --- 1. Ficheros tocados: package.json, lockfiles ---
PACKAGE_JSON_LIST=$(awk '
  /^diff --git/ {
    if (match($0, /b\/(.+)$/)) {
      file = substr($0, RSTART+2, RLENGTH-2)
      if (file ~ /\/package\.json$|^package\.json$/) print file
    }
  }
' "$PATCH_FILE" | sort -u)

LOCKFILE_LIST=$(awk '
  /^diff --git/ {
    if (match($0, /b\/(.+)$/)) {
      file = substr($0, RSTART+2, RLENGTH-2)
      if (file ~ /yarn\.lock$|package-lock\.json$|pnpm-lock\.yaml$/) print file
    }
  }
' "$PATCH_FILE" | sort -u)

# --- 2. Paquetes externos del root package.json (excluyendo @wetaca/*) ---
EXTERNAL_PACKAGES=""
ROOT_PKG="$REPO_ROOT/package.json"
if [[ -f "$ROOT_PKG" ]]; then
  # Extrae todas las claves de dependencies + devDependencies que NO empiezan por @wetaca/
  # Usa jq si está disponible; fallback a grep+sed.
  if command -v jq >/dev/null 2>&1; then
    EXTERNAL_PACKAGES=$(jq -r '
      (.dependencies // {}) as $d
      | (.devDependencies // {}) as $dd
      | ($d + $dd) | keys | map(select(startswith("@wetaca/") | not)) | .[]
    ' "$ROOT_PKG" 2>/dev/null || echo "")
  else
    EXTERNAL_PACKAGES=$(grep -E '^\s*"[^"]+"\s*:\s*"[^"]+"\s*,?\s*$' "$ROOT_PKG" \
      | sed -E 's/^\s*"([^"]+)".*$/\1/' \
      | grep -v '^@wetaca/' \
      | grep -v '^\$schema$' \
      | sort -u || echo "")
  fi
fi

# --- 3. Imports nuevos desde paquetes externos ---
# Heurística: líneas añadidas (^+) que matchean `import ... from 'pkg'` o `require('pkg')`,
# donde pkg está en la lista de paquetes externos, o empieza con un nombre típico de package
# externo (no relativo, no `@wetaca/*`).
NEW_IMPORTS_JSON=$(awk '
  /^diff --git/ { file=""; line=0; next }
  /^\+\+\+ b\// {
    sub(/^\+\+\+ b\//, "", $0)
    file=$0
    line=0
    is_code = (file ~ /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/) ? 1 : 0
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
    if (!is_code) next
    snip = substr($0, 2)
    # ES module: import ... from "pkg" / from "pkg/sub"
    # Caracter classes simples para portabilidad awk (sin slash en negaciones complejas).
    if (match(snip, /from[ \t]+["][^"]+["]/) || match(snip, /from[ \t]+[\047][^\047]+[\047]/)) {
      pkg = substr(snip, RSTART, RLENGTH)
      gsub(/^from[ \t]+/, "", pkg)
      gsub(/^["\047]/, "", pkg)
      gsub(/["\047]$/, "", pkg)
      # Drop subpath: para `pkg/sub` el paquete es `pkg`; para `@scope/pkg/sub` es `@scope/pkg`.
      if (substr(pkg, 1, 1) == "@") {
        n = split(pkg, parts, "/")
        if (n >= 2) pkg = parts[1] "/" parts[2]
      } else {
        n = split(pkg, parts, "/")
        if (n >= 1) pkg = parts[1]
      }
      if (pkg !~ /^@wetaca\// && pkg !~ /^\./ && pkg != "") {
        printf "{\"file\":\"%s\",\"line\":%d,\"package\":\"%s\",\"kind\":\"import\"},\n", file, line, pkg
      }
    }
    # CommonJS: require("pkg")
    else if (match(snip, /require[(]["][^"]+["][)]/) || match(snip, /require[(][\047][^\047]+[\047][)]/)) {
      pkg = substr(snip, RSTART, RLENGTH)
      gsub(/^require[(]["\047]/, "", pkg)
      gsub(/["\047][)]$/, "", pkg)
      if (substr(pkg, 1, 1) == "@") {
        n = split(pkg, parts, "/")
        if (n >= 2) pkg = parts[1] "/" parts[2]
      } else {
        n = split(pkg, parts, "/")
        if (n >= 1) pkg = parts[1]
      }
      if (pkg !~ /^@wetaca\// && pkg !~ /^\./ && pkg != "") {
        printf "{\"file\":\"%s\",\"line\":%d,\"package\":\"%s\",\"kind\":\"require\"},\n", file, line, pkg
      }
    }
  }
' "$PATCH_FILE" | tr -d '\n' | sed 's|,$||')

# --- 4. modifiedUsageCandidates: líneas añadidas que mencionan algún paquete instalado ---
# Heurística: por cada paquete externo, busca su nombre exacto en líneas añadidas que NO sean import/require.
# Esto detecta "se usa un método nuevo de un paquete ya importado". El agent valida si es uso real.
MODIFIED_USAGE_JSON=""
if [[ -n "$EXTERNAL_PACKAGES" ]]; then
  TMP_PKGS=$(mktemp)
  echo "$EXTERNAL_PACKAGES" > "$TMP_PKGS"
  MODIFIED_USAGE_JSON=$(awk -v pkgs_file="$TMP_PKGS" '
    BEGIN {
      while ((getline p < pkgs_file) > 0) {
        if (p != "") pkgs[p] = 1
      }
      close(pkgs_file)
    }
    /^diff --git/ { file=""; line=0; next }
    /^\+\+\+ b\// {
      sub(/^\+\+\+ b\//, "", $0)
      file=$0
      line=0
      is_code = (file ~ /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/) ? 1 : 0
      next
    }
    /^@@/ {
      if (match($0, /\+([0-9]+)/)) line = substr($0, RSTART+1, RLENGTH-1) + 0 - 1
      next
    }
    /^\+[^+]/ {
      line++
      if (!is_code) next
      snip = substr($0, 2)
      # Skip lines that are imports/requires — those van a newImports.
      if (snip ~ /^[[:space:]]*import[[:space:]]/ || snip ~ /require[(]/) next
      for (pkg in pkgs) {
        # Match nombre del paquete entre word boundaries.
        if (snip ~ ("[^A-Za-z0-9_/@\\-]" pkg "[^A-Za-z0-9_/@\\-]") || snip ~ ("^" pkg "[^A-Za-z0-9_/@\\-]") || snip ~ ("[^A-Za-z0-9_/@\\-]" pkg "$")) {
          printf "{\"file\":\"%s\",\"line\":%d,\"package\":\"%s\"},\n", file, line, pkg
          break
        }
      }
    }
  ' "$PATCH_FILE" | tr -d '\n' | sed 's|,$||')
  rm -f "$TMP_PKGS"
fi

# --- 5. JSON output ---
to_json_array_strings() {
  local input="$1"
  if [[ -z "$input" ]]; then
    echo "[]"
    return
  fi
  echo "$input" | awk 'BEGIN { printf "[" } { if (NR>1) printf ","; printf "\"%s\"", $0 } END { printf "]" }'
}

PACKAGE_JSON_ARR=$(to_json_array_strings "$PACKAGE_JSON_LIST")
LOCKFILE_ARR=$(to_json_array_strings "$LOCKFILE_LIST")
EXTERNAL_PKGS_ARR=$(to_json_array_strings "$EXTERNAL_PACKAGES")

NEW_IMPORTS_ARR="[${NEW_IMPORTS_JSON}]"
MODIFIED_USAGE_ARR="[${MODIFIED_USAGE_JSON}]"

# Cuenta total = packageJsonChanged + newImports + modifiedUsageCandidates.
# Bug previo: con `pipefail`, el patrón `pipeline || echo 0` capturaba DOS líneas
# (la "0" del pipeline tras grep-no-match y la "0" del fallback echo), rompiendo
# la expansión aritmética con "syntax error: invalid arithmetic operator".
# Fix: envolver `grep` con `|| true` DENTRO del pipe para que nunca propague exit 1.
# Importante: NEW_IMPORTS_JSON y MODIFIED_USAGE_JSON quedan en UNA SOLA línea tras
# el `tr -d '\n'` de su construcción, así que `grep -c` daría 1 ignorando N objetos.
# Hay que usar `grep -o | wc -l` para contar OCURRENCIAS (no líneas).
COUNT_PJ=0
if [[ -n "$PACKAGE_JSON_LIST" ]]; then
  COUNT_PJ=$(grep -c . <<<"$PACKAGE_JSON_LIST" || true)
fi
COUNT_NI=$(echo -n "$NEW_IMPORTS_JSON" | { grep -o '"file"' || true; } | wc -l | tr -d ' ')
COUNT_MU=$(echo -n "$MODIFIED_USAGE_JSON" | { grep -o '"file"' || true; } | wc -l | tr -d ' ')
COUNT_PJ=${COUNT_PJ:-0}
COUNT_NI=${COUNT_NI:-0}
COUNT_MU=${COUNT_MU:-0}
TOTAL=$((COUNT_PJ + COUNT_NI + COUNT_MU))

cat <<EOF
{"packageJsonChanged":${PACKAGE_JSON_ARR},"lockfileChanged":${LOCKFILE_ARR},"newImports":${NEW_IMPORTS_ARR},"modifiedUsageCandidates":${MODIFIED_USAGE_ARR},"externalPackages":${EXTERNAL_PKGS_ARR},"count":${TOTAL}}
EOF
