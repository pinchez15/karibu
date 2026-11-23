#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Runs the Karibu Office SQL tests with ZERO production contact:
#   1. init a throwaway local Postgres 17 cluster (TCP only, port 55441)
#   2. apply packages/supabase-demo/scripts/supabase-shim.sql (auth.jwt(), roles, storage)
#   3. replay every migration in migrations/ (minus demo seeds 004/012/014)
#   4. run tests/office_*.sql, each in its own rolled-back transaction
#   5. tear the cluster down
#
# The tests run against the REAL EHR schema, so an EHR migration that renames
# a column the office RPCs read fails here.
#
#   brew install postgresql@17 pgvector
#   packages/supabase/scripts/test-office-local.sh

PGBIN=""
for p in /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@17/bin /usr/lib/postgresql/17/bin; do
  [[ -x "$p/initdb" ]] && PGBIN="$p" && break
done
[[ -n "$PGBIN" ]] || { echo "error: postgresql@17 not found (brew install postgresql@17 pgvector)" >&2; exit 1; }

SCRATCH="$(mktemp -d /tmp/karibu-office-test.XXXXXX)"
export PGHOST=127.0.0.1 PGPORT=55441 PGUSER=shadow PGDATABASE=postgres

cleanup() {
  "$PGBIN/pg_ctl" -D "$SCRATCH/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$SCRATCH/data" -U shadow --auth=trust >/dev/null
# TCP only: a long socket path under a temp dir can exceed the OS limit.
"$PGBIN/pg_ctl" -D "$SCRATCH/data" -o "-p $PGPORT -c unix_socket_directories=''" -l "$SCRATCH/pg.log" -w start >/dev/null
"$PGBIN/createdb" karibu_office_test
export PGDATABASE=karibu_office_test

echo "== shim"
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f ../supabase-demo/scripts/supabase-shim.sql 2>/dev/null

echo "== migrations"
for f in $(ls migrations/*.sql | grep -vE "/(004|012|014)_"); do
  # 018's ALTER PUBLICATION syntax was never valid Postgres (see supabase-demo/scripts).
  if ! sed -e 's|^ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS visits;|DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE visits; EXCEPTION WHEN OTHERS THEN NULL; END $$;|' "$f" \
      | "$PGBIN/psql" -v ON_ERROR_STOP=1 -q >/dev/null 2>"$SCRATCH/err.txt"; then
    echo "FAILED at $(basename "$f"):" >&2
    cat "$SCRATCH/err.txt" >&2
    exit 1
  fi
done

echo "== tests"
status=0
for t in tests/office_*.sql; do
  if out="$("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f "$t" 2>&1)"; then
    echo "ok    $(basename "$t")"
  else
    echo "FAIL  $(basename "$t")"
    echo "$out" | grep -E "ERROR|CONTEXT" | head -6
    status=1
  fi
done
exit $status
