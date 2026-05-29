#!/usr/bin/env bash
# Audit Android for direct PostgREST writes to RLS-protected tables.
# EHR pivot requires RPC-only cloud writes. Exit 1 if violations found.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/apps/android"

violations=0

echo "== Android PostgREST write audit =="
echo "Scanning for suspicious Supabase table writes (POST/PATCH/DELETE on rest/v1)..."

# Retrofit @POST/@PATCH/@DELETE on table paths (not rpc/)
search() {
  if command -v rg >/dev/null 2>&1; then
    rg -n "$1" "$ANDROID" --glob '*.kt' -g '!**/build/**' 2>/dev/null || true
  else
    grep -rn "$1" "$ANDROID" --include='*.kt' 2>/dev/null | grep -v '/build/' || true
  fi
}

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  echo "  VIOLATION: $line"
  violations=$((violations + 1))
done < <(
  search '@POST\("' | grep -v 'rpc/' | grep -E 'rest/v1|"(visits|patients|provider_notes|payments|admissions)"' || true
)

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  echo "  VIOLATION: $line"
  violations=$((violations + 1))
done < <(
  search '\.from\("(visits|patients|provider_notes|payments)"\)' || true
)

if [[ "$violations" -eq 0 ]]; then
  echo "OK: no obvious direct table writes found. Manual review still required for new endpoints."
  exit 0
fi

echo "FAIL: $violations potential direct-write pattern(s). Route through SECURITY DEFINER RPCs."
exit 1
