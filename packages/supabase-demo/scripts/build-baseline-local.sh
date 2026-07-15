#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Builds migrations/0001_baseline.sql with ZERO production contact:
#   1. init a throwaway local Postgres 17 cluster (scratch dir, port 55432)
#   2. apply scripts/supabase-shim.sql (platform surface migrations expect)
#   3. replay packages/supabase/migrations 001-105 (minus demo seeds 004/012/014),
#      with the same compat transforms as the SQL-editor bundle
#   4. pg_dump the resulting PUBLIC schema end state -> migrations/0001_baseline.sql
#   5. tear the cluster down
#
# The end state equals production's schema because the same migrations built
# production. (Known caveat: any hand-run SQL-editor drift on prod is not
# captured — acceptable for the demo environment.)

PGBIN=""
for p in /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@17/bin; do
  [[ -x "$p/initdb" ]] && PGBIN="$p" && break
done
[[ -n "$PGBIN" ]] || { echo "error: postgresql@17 not found (brew install postgresql@17 pgvector)" >&2; exit 1; }

MIG="../supabase/migrations"
OUT="migrations/0001_baseline.sql"
PORT=55432
SCRATCH="$(mktemp -d /tmp/karibu-shadow.XXXXXX)"
export PGHOST=localhost PGPORT=$PORT PGUSER=shadow PGDATABASE=postgres

cleanup() {
  "$PGBIN/pg_ctl" -D "$SCRATCH/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "== init throwaway cluster in $SCRATCH"
"$PGBIN/initdb" -D "$SCRATCH/data" -U shadow --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SCRATCH/data" -o "-p $PORT -k $SCRATCH" -l "$SCRATCH/pg.log" start >/dev/null
"$PGBIN/createdb" karibu_shadow
export PGDATABASE=karibu_shadow

# Same compat fixes as build-sql-editor-bundle.sh (018's ALTER PUBLICATION
# syntax was never valid Postgres; must have been applied by hand on prod).
transform() {
  sed \
    -e 's|^ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS visits;|DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE visits; EXCEPTION WHEN OTHERS THEN NULL; END $$;|' \
    "$1"
}

echo "== apply supabase shim"
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f scripts/supabase-shim.sql

echo "== replay migrations"
for f in $(ls "$MIG"/*.sql | grep -vE "/(004|012|014)_"); do
  if ! transform "$f" | "$PGBIN/psql" -v ON_ERROR_STOP=1 -q 2> "$SCRATCH/err.txt"; then
    echo "FAILED at $(basename "$f"):" >&2
    cat "$SCRATCH/err.txt" >&2
    exit 1
  fi
done

echo "== dump end state -> $OUT"
{
  echo "-- Consolidated schema baseline: end state of packages/supabase/migrations"
  echo "-- 001-105 (minus demo seeds 004/012/014), built $(date +%Y-%m-%d) on a local"
  echo "-- shadow Postgres. Regenerate with scripts/build-baseline-local.sh."
  echo ""
  echo "-- Platform-preinstalled extensions (no-ops on a real Supabase project):"
  echo "CREATE SCHEMA IF NOT EXISTS extensions;"
  echo 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;'
  echo "CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;"
  echo "-- Migration-added extensions, in public exactly as on prod (033/038/066):"
  echo "CREATE EXTENSION IF NOT EXISTS vector        WITH SCHEMA public;"
  echo "CREATE EXTENSION IF NOT EXISTS pg_trgm       WITH SCHEMA public;"
  echo "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;"
  echo ""
  # Strip: transaction_timeout (GUC absent on older servers) and the
  # \restrict/\unrestrict psql meta-commands new pg_dump versions emit
  # (not SQL; the dashboard SQL editor and drivers reject them).
  # Also strip CREATE SCHEMA public (pg_dump emits it on PG15+; the schema
  # always already exists on the target and errors the whole batch).
  "$PGBIN/pg_dump" --schema=public --schema-only --no-owner --no-privileges karibu_shadow \
    | sed -e '/^SET transaction_timeout/d' -e '/^\\restrict /d' -e '/^\\unrestrict /d' \
          -e '/^CREATE SCHEMA public;/d'
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
