#!/usr/bin/env bash
#
# PHARM-4 scope fence (spec R6).
#
# The §0 invariant ("the AI has recording power, not prescribing power") is
# enforced at runtime by the RPC source gate. THIS check enforces PROVENANCE at
# the source level: nothing outside the prescription composer (web) / picker
# (Android) — and their sanctioned host/repository/sync surfaces — may
# construct a prescription-line submit payload. A new call site that assembles
# `p_lines` / `SubmitPharmacyOrderRequest` outside the allowlist is how an
# AI-authored line could sneak toward the pharmacy queue; fail the build so a
# human reviews it (and, if legitimate, adds it to the allowlist below).
#
# Wire into CI (e.g. a lint/test job) as: bash scripts/check-prescription-payload-fences.sh
#
# Exit 0 = clean, 1 = an out-of-fence construction site was found.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

# grep helper: prints offending files not in the allowlist.
# args: <label> <pattern> <search_root> <allowlist...>
check() {
  local label="$1"; shift
  local pattern="$1"; shift
  local search_root="$1"; shift
  local allow=("$@")

  # Collect matching files (exclude build output). If grep finds nothing it
  # exits 1 under `set -e`, so guard with `|| true`.
  local matches
  matches="$(grep -rlE "$pattern" "$search_root" \
    --include='*.ts' --include='*.tsx' --include='*.kt' \
    2>/dev/null | grep -v '/\.next/' | sort -u || true)"

  local f allowed
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    allowed=0
    for a in "${allow[@]}"; do
      if [ "$f" = "$a" ]; then allowed=1; break; fi
    done
    if [ "$allowed" -eq 0 ]; then
      echo "FENCE VIOLATION [$label]: $f constructs a prescription submit payload but is not on the allowlist."
      fail=1
    fi
  done <<< "$matches"
}

# --- Web: the submit RPC may only be invoked from the server action ---
check "web:rpc_submit_pharmacy_order" \
  "rpc_submit_pharmacy_order" \
  "apps/web/src" \
  "apps/web/src/app/dashboard/visits/actions.ts"

# --- Web: only the composer + its sanctioned hosts build the line payload ---
check "web:draftLinesToRpcInput" \
  "draftLinesToRpcInput" \
  "apps/web/src" \
  "apps/web/src/components/prescription/PrescriptionComposer.tsx" \
  "apps/web/src/components/prescription/PrescriptionComposer.test.tsx" \
  "apps/web/src/components/prescription/VisitPharmacyPanel.tsx" \
  "apps/web/src/app/dashboard/visits/[id]/PendingDictationCard.tsx"

# --- Android: only the picker + DTO/repo/sync surfaces build the payload ---
# (Agent E owns these files; keep this allowlist in sync when picker wiring moves.)
check "android:SubmitPharmacyOrderRequest" \
  "SubmitPharmacyOrderRequest\(|PrescriptionLineRpc\(" \
  "apps/android/app/src/main" \
  "apps/android/app/src/main/java/com/karibuhealth/app/ui/dictation/PharmacyPickerSheet.kt" \
  "apps/android/app/src/main/java/com/karibuhealth/app/ui/visitdetails/VisitDetailsViewModel.kt" \
  "apps/android/app/src/main/java/com/karibuhealth/app/data/repository/VisitRepository.kt" \
  "apps/android/app/src/main/java/com/karibuhealth/app/data/remote/dto/Dtos.kt"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "One or more files construct prescription-line submit payloads outside the"
  echo "composer/picker fence. If the new site is legitimate, add it to the"
  echo "allowlist in scripts/check-prescription-payload-fences.sh and have a human"
  echo "confirm it never carries an AI-authored source."
  exit 1
fi

echo "prescription payload fences OK"
