#!/usr/bin/env bash
# !script-id: compute-mr-size
# !purpose: Calcula tamaño del diff (LOC + file count) y sugiere bucket (TINY/SMALL/MEDIUM/LARGE/HUGE) para el orquestador
# !inputs: $1 (path al .patch); opcional $2 (base ref, default "master")
# !outputs: stdout JSON. Schema: { fileCount: N, addedLines: N, removedLines: N, totalLines: N, bucket: "TINY"|"SMALL"|"MEDIUM"|"LARGE"|"HUGE" }
# !audited: 2026-05-20 (initial audit, manual review pendiente del owner)
# !version: 1.0.0
#
# Computa métricas básicas del diff. El bucket cap viene de D18 del plan
# (TINY 30K / SMALL 100K / MEDIUM 400K / LARGE 1.5M / HUGE 4M+ tokens).
# Aquí mapeamos LOC a buckets heuristico para que el orquestador decida.

set -euo pipefail

PATCH_FILE="${1:-}"
BASE_REF="${2:-master}"

if [[ -z "$PATCH_FILE" || ! -f "$PATCH_FILE" ]]; then
  # Si no se provee patch file, genera el diff vs base ref
  TMP_PATCH=$(mktemp)
  trap 'rm -f "$TMP_PATCH"' EXIT
  git diff "$BASE_REF"...HEAD > "$TMP_PATCH"
  PATCH_FILE="$TMP_PATCH"
fi

# Cuenta de archivos: líneas que empiezan por "diff --git"
FILE_COUNT=$(grep -c "^diff --git" "$PATCH_FILE" || true)

# Líneas añadidas/eliminadas (excluyendo headers "+++/---")
ADDED=$(grep -c "^+[^+]" "$PATCH_FILE" || true)
REMOVED=$(grep -c "^-[^-]" "$PATCH_FILE" || true)
TOTAL=$((ADDED + REMOVED))

# Heurística de bucket por LOC total
if   [[ $TOTAL -le 50 ]];   then BUCKET="TINY"
elif [[ $TOTAL -le 200 ]];  then BUCKET="SMALL"
elif [[ $TOTAL -le 600 ]];  then BUCKET="MEDIUM"
elif [[ $TOTAL -le 1500 ]]; then BUCKET="LARGE"
else                              BUCKET="HUGE"
fi

cat <<EOF
{
  "fileCount": $FILE_COUNT,
  "addedLines": $ADDED,
  "removedLines": $REMOVED,
  "totalLines": $TOTAL,
  "bucket": "$BUCKET"
}
EOF
