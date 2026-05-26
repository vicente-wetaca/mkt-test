#!/usr/bin/env bash
# !script-id: run-tests-summary
# !purpose: Ejecuta la suite Jest (full o subset por paths) y filtra el output crudo a un resumen compacto (pass/fail counts + lista de fallos con file/test/snippet del error)
# !inputs: $@ (opcional, paths de test específicos; si vacío, full suite). Env $WORKSPACE_ROOT default = pwd
# !outputs: stdout JSON. Schema: { passed: N, failed: N, skipped: N, totalSuites: N, durationMs: N, failures: [{ file, tests: [{name, message}] }], timeout: bool }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# El reviewer R-tests consume este JSON. Output crudo de jest puede ser MB;
# el filtrado deja <2KB típico. Si tarda >5min, kill + reporta timeout=true.

set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
TIMEOUT_S=300
TEST_PATHS=("$@")

cd "$WORKSPACE_ROOT"

TMP_JSON=$(mktemp)
TMP_ERR=$(mktemp)
trap 'rm -f "$TMP_JSON" "$TMP_ERR"' EXIT

# Construye comando jest
JEST_CMD=(yarn jest --json --silent --testPathIgnorePatterns=node_modules)
if [[ ${#TEST_PATHS[@]} -gt 0 ]]; then
  JEST_CMD+=("${TEST_PATHS[@]}")
fi

# Ejecuta con timeout. macOS no tiene `timeout` por defecto — uso perl como fallback portable
START_MS=$(date +%s%3N 2>/dev/null || gdate +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))

if command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
elif command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
else
  TIMEOUT_BIN=""
fi

EXIT_CODE=0
if [[ -n "$TIMEOUT_BIN" ]]; then
  "$TIMEOUT_BIN" "$TIMEOUT_S" "${JEST_CMD[@]}" > "$TMP_JSON" 2> "$TMP_ERR" || EXIT_CODE=$?
else
  # Sin timeout binary: ejecuta sin cap (último recurso)
  "${JEST_CMD[@]}" > "$TMP_JSON" 2> "$TMP_ERR" || EXIT_CODE=$?
fi

END_MS=$(date +%s%3N 2>/dev/null || gdate +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))
DURATION=$((END_MS - START_MS))

# Detecta timeout (124 = exit code estándar de timeout)
if [[ $EXIT_CODE -eq 124 ]]; then
  cat <<EOF
{
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "totalSuites": 0,
  "durationMs": $DURATION,
  "failures": [],
  "timeout": true,
  "error": "Test run exceeded ${TIMEOUT_S}s timeout"
}
EOF
  exit 0
fi

# Si jest no produjo JSON parseable (otro error), reporta error wrapper
if ! jq -e . "$TMP_JSON" >/dev/null 2>&1; then
  ERR_MSG=$(head -c 500 "$TMP_ERR" | tr -d '\n' | sed 's|"|\\"|g')
  cat <<EOF
{
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "totalSuites": 0,
  "durationMs": $DURATION,
  "failures": [],
  "timeout": false,
  "error": "Jest did not produce valid JSON output: $ERR_MSG"
}
EOF
  exit 0
fi

# Filtra y resume con jq. Limita primeras 6 líneas del mensaje de error por test.
jq --argjson duration "$DURATION" '
  {
    passed: (.numPassedTests // 0),
    failed: (.numFailedTests // 0),
    skipped: (.numPendingTests // 0),
    totalSuites: (.numTotalTestSuites // 0),
    durationMs: $duration,
    failures: [
      .testResults[] | select(.numFailingTests > 0) | {
        file: .name,
        tests: [
          .testResults[] | select(.status == "failed") | {
            name: ((.ancestorTitles // []) + [.title] | join(" > ")),
            message: ((.failureMessages // []) | join("\n") | split("\n") | .[0:6] | join("\n"))
          }
        ]
      }
    ],
    timeout: false
  }
' "$TMP_JSON"
