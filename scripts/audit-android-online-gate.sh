#!/usr/bin/env bash
# Audit Android repositories for isOnline() write/read gates.
# WP-C requires cloudReady = isConnected(); exit 1 if isOnline() remains in data/repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$ROOT/apps/android/app/src/main/java/com/karibuhealth/app/data/repository"

violations=0

echo "== Android online-gate audit (WP-C) =="
echo "Scanning data/repository for isOnline() (must use isConnected() instead)..."

search() {
  if command -v rg >/dev/null 2>&1; then
    rg -n "isOnline\(\)" "$REPO_DIR" --glob '*.kt' 2>/dev/null || true
  else
    grep -rn "isOnline()" "$REPO_DIR" --include='*.kt' 2>/dev/null || true
  fi
}

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  echo "  VIOLATION: $line"
  violations=$((violations + 1))
done < <(search)

if [[ "$violations" -eq 0 ]]; then
  echo "OK: no isOnline() gates in data/repository."
  exit 0
fi

echo "FAIL: $violations isOnline() gate(s) in data/repository. Use networkMonitor.isConnected() instead."
exit 1
