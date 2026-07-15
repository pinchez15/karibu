#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Builds migrations/0001_baseline.sql — a single consolidated schema file dumped
# from PRODUCTION, which is the ground-truth end state of migrations 001–105
# (including any SQL-editor drift the migration files don't capture).
#
# SCHEMA ONLY. No table data is ever dumped from production; reference data
# comes from scripts/build-reference-seed.sh (extracted from the repo's own
# migration files) and demo content from seed/20_demo_census.sql.
#
# Usage:
#   PROD_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     pnpm --filter @karibu/supabase-demo build-baseline
#
# Get the URL from: Supabase dashboard -> production project -> Connect ->
# Session pooler. Percent-encode special characters in the password.
#
# Requires ONE of:
#   - Docker running                 (supabase db dump runs pg_dump in a container)
#   - pg_dump on PATH                (brew install libpq && brew link --force libpq)

PROD_REF="sopirdewhhpxdxpwwosn"
OUT="migrations/0001_baseline.sql"

# Load PROD_DB_URL from .env if not already in the environment.
if [[ -z "${PROD_DB_URL:-}" && -f .env ]]; then
  PROD_DB_URL="$(grep -m1 '^PROD_DB_URL=' .env | cut -d= -f2-)"
fi
: "${PROD_DB_URL:?Set PROD_DB_URL (env var or line in packages/supabase-demo/.env) to the production Postgres connection string (schema-only dump; no data is read)}"

# Find pg_dump: PATH, then Homebrew libpq (keg-only, not linked by default).
PG_DUMP=""
for candidate in pg_dump /usr/local/opt/libpq/bin/pg_dump /opt/homebrew/opt/libpq/bin/pg_dump; do
  if command -v "$candidate" >/dev/null 2>&1; then PG_DUMP="$candidate"; break; fi
done

if [[ -f demo-project-ref ]]; then
  DEMO_REF="$(tr -d '[:space:]' < demo-project-ref)"
  if [[ "$DEMO_REF" != *REPLACE* && "$PROD_DB_URL" == *"$DEMO_REF"* ]]; then
    echo "error: PROD_DB_URL points at the DEMO project ($DEMO_REF); baseline must come from production." >&2
    exit 1
  fi
fi
if [[ "$PROD_DB_URL" != *"$PROD_REF"* ]]; then
  echo "warning: PROD_DB_URL does not contain the known production ref ($PROD_REF) — continuing, but double-check the URL." >&2
fi

if [[ -n "$PG_DUMP" ]]; then
  echo "== $PG_DUMP (native) -> $OUT"
  {
    echo "-- Consolidated production schema baseline, dumped $(date +%Y-%m-%d)."
    echo "-- Replaces replaying packages/supabase/migrations 001-105 on fresh environments."
    echo "-- Regenerate with: packages/supabase-demo/scripts/build-baseline.sh"
    echo ""
    echo "CREATE SCHEMA IF NOT EXISTS extensions;"
    echo 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;'
    echo "CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;"
    echo "CREATE EXTENSION IF NOT EXISTS vector    WITH SCHEMA extensions;"
    echo ""
    "$PG_DUMP" "$PROD_DB_URL" --schema=public --schema-only --no-owner --no-privileges \
      | sed -e '/^SET transaction_timeout/d'
  } > "$OUT"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "== supabase db dump (via Docker) -> $OUT"
  supabase db dump --db-url "$PROD_DB_URL" -f "$OUT"
else
  echo "error: need pg_dump (brew install libpq) or Docker running (for 'supabase db dump')." >&2
  exit 1
fi

echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
echo ""
echo "Next: review the file, then apply to the demo project:"
echo "  supabase link --project-ref \$(cat demo-project-ref)"
echo "  supabase db push"
