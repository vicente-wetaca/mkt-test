#!/usr/bin/env bash
# Smoke test del hook check-workspace-writes.py.
# Construye payloads JSON sintéticos y verifica que el hook acepta/deniega
# como esperamos. Salida humana legible + exit code 0 (todo verde) o 1 (fallo).
#
# Marker-based gating: el hook SÓLO restringe cuando existe el fichero
# `.dev/MR-auto-review/_state/.active`. Este smoke crea el marker al
# principio y lo borra al final (cleanup en EXIT trap).

set -u

HOOK="$(cd "$(dirname "$0")/.." && pwd)/check-workspace-writes.py"
if [[ ! -x "$HOOK" ]]; then
  echo "ERROR: hook no encontrado o no ejecutable: $HOOK" >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
MARKER_DIR="${REPO_ROOT}/.dev/MR-auto-review/_state"
MARKER_FILE="${MARKER_DIR}/.active"
MARKER_PREEXISTED=0
if [[ -f "$MARKER_FILE" ]]; then
  MARKER_PREEXISTED=1
fi

cleanup_marker() {
  if [[ "$MARKER_PREEXISTED" -eq 0 ]]; then
    rm -f "$MARKER_FILE"
    rmdir "$MARKER_DIR" 2>/dev/null || true
  fi
}
trap cleanup_marker EXIT

mkdir -p "$MARKER_DIR"
echo "{}" > "$MARKER_FILE"

PASS=0
FAIL=0

# Comprueba que un payload JSON produce el campo expected ("allow":true|false).
# Args: $1=descripción $2=payload JSON $3=expected ("allow":true|"allow":false)
check() {
  local desc="$1"
  local payload="$2"
  local expected="$3"
  local out
  out=$(echo "$payload" | "$HOOK")
  if echo "$out" | grep -q "$expected"; then
    echo "OK    $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $desc"
    echo "      payload : $payload"
    echo "      expected: $expected"
    echo "      got     : $out"
    FAIL=$((FAIL + 1))
  fi
}

# Caso 1: Edit dentro del workspace → allow
check "Edit en workspace" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/repo/.dev/MR-auto-review/WET-4814/foo.md"}}' \
  '"allow": true'

# Caso 2: Edit fuera del workspace → deny
check "Edit fuera del workspace" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/repo/services/payments/src/index.ts"}}' \
  '"allow": false'

# Caso 3: Write dentro del workspace → allow
check "Write en workspace" \
  '{"tool_name":"Write","tool_input":{"file_path":"/Users/x/proj/.dev/MR-auto-review/local-test/file.txt"}}' \
  '"allow": true'

# Caso 4: NotebookEdit fuera → deny
check "NotebookEdit fuera" \
  '{"tool_name":"NotebookEdit","tool_input":{"file_path":"/home/u/.bashrc"}}' \
  '"allow": false'

# Caso 5: Read (no-write) → allow (no inspecciona)
check "Read no inspeccionado" \
  '{"tool_name":"Read","tool_input":{"file_path":"/etc/passwd"}}' \
  '"allow": true'

# Caso 6: Bash sin redirect → allow
check "Bash sin redirect" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  '"allow": true'

# Caso 7: Bash con > a path fuera → deny
check "Bash > fuera" \
  '{"tool_name":"Bash","tool_input":{"command":"echo evil > /tmp/payload.sh"}}' \
  '"allow": false'

# Caso 8: Bash con > a path dentro → allow
check "Bash > dentro" \
  '{"tool_name":"Bash","tool_input":{"command":"echo ok > /repo/.dev/MR-auto-review/WET-4814/out.txt"}}' \
  '"allow": true'

# Caso 9: Bash con > /dev/null → allow
check "Bash > /dev/null" \
  '{"tool_name":"Bash","tool_input":{"command":"git log > /dev/null"}}' \
  '"allow": true'

# Caso 10: Bash con sed -i en path externo → deny
check "Bash sed -i fuera" \
  '{"tool_name":"Bash","tool_input":{"command":"sed -i s/foo/bar/g /etc/hosts"}}' \
  '"allow": false'

# Caso 11: Bash con tee a path externo → deny
check "Bash tee fuera" \
  '{"tool_name":"Bash","tool_input":{"command":"echo data | tee /tmp/leak"}}' \
  '"allow": false'

# Caso 12: Bash con mv fuera → deny
check "Bash mv fuera" \
  '{"tool_name":"Bash","tool_input":{"command":"mv /tmp/src /etc/dst"}}' \
  '"allow": false'

# Caso 13: stdin malformado → allow (fail-open por defecto)
check "stdin malformado" \
  'not json at all' \
  '"allow": true'

# Caso 14: payload con tool desconocido → allow
check "tool desconocido" \
  '{"tool_name":"WeirdTool","tool_input":{"x":1}}' \
  '"allow": true'

# Caso 15: Bash con variable $X → allow (no se puede checkear estáticamente)
check "Bash con variable shell" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello > $OUT"}}' \
  '"allow": true'

# Caso 16: SIN marker → hook transparente (allow incluso Edit fuera de workspace)
rm -f "$MARKER_FILE"
check "Edit fuera (sin marker → allow)" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/etc/hosts"}}' \
  '"allow": true'
check "Bash > fuera (sin marker → allow)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo evil > /tmp/leak"}}' \
  '"allow": true'

# Restaurar marker para los siguientes tests (no aplica — éstos son los últimos)
echo "{}" > "$MARKER_FILE"

echo "---"
echo "PASS=$PASS  FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
