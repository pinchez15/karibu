#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Regression test: applies the sql-editor bundle to a fresh local Postgres the
# same way the dashboard SQL editor does (each file = one transaction), then
# runs sanity checks, then applies the reset file. Catches broken chunk
# boundaries / invalid statements before a human pastes anything.

PGBIN=""
for p in /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@17/bin; do
  [[ -x "$p/initdb" ]] && PGBIN="$p" && break
done
[[ -n "$PGBIN" ]] || { echo "error: postgresql@17 not found" >&2; exit 1; }

PORT=55433
SCRATCH="$(mktemp -d /tmp/karibu-bundle-test.XXXXXX)"
export PGHOST=localhost PGPORT=$PORT PGUSER=shadow PGDATABASE=postgres

cleanup() {
  "$PGBIN/pg_ctl" -D "$SCRATCH/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$SCRATCH/data" -U shadow --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$SCRATCH/data" -o "-p $PORT -k $SCRATCH" -l "$SCRATCH/pg.log" start >/dev/null
"$PGBIN/createdb" karibu_bundle_test
export PGDATABASE=karibu_bundle_test

# Platform surface a real demo Supabase project already has.
"$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f scripts/supabase-shim.sql 2>/dev/null

apply() {
  echo "  applying $1 ..."
  if ! "$PGBIN/psql" -v ON_ERROR_STOP=1 -q --single-transaction -f "$1" 2> "$SCRATCH/err.txt"; then
    echo "FAILED at $1:" >&2
    cat "$SCRATCH/err.txt" >&2
    exit 1
  fi
}

echo "== applying bundle (as the SQL editor would)"
for f in sql-editor/01_schema_part_*.sql sql-editor/05_migration_history.sql sql-editor/06_seed.sql; do
  apply "$f"
done

echo "== sanity checks"
"$PGBIN/psql" -v ON_ERROR_STOP=1 -qtA <<'SQL'
SELECT 'tables: '        || count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT 'functions: '     || count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
SELECT 'medications: '   || count(*) FROM medication_catalog;
SELECT 'lab tests: '     || count(*) FROM lab_test_catalog;
SELECT 'hmis codes: '    || count(*) FROM hmis_diagnosis_codes;
SELECT 'demo clinics: '  || count(*) FROM clinics;
SELECT 'formulary rows: '|| count(*) FROM clinic_pharmacy_formulary;
SELECT 'lab capability: '|| count(*) FROM clinic_lab_capabilities;
SELECT 'billing rates: ' || count(*) FROM clinic_billing_rates;
SELECT 'migrations marked: ' || count(*) FROM supabase_migrations.schema_migrations;
SQL

echo "== census checks (expected: patients 20, visits 27, today 7)"
"$PGBIN/psql" -v ON_ERROR_STOP=1 -qtA <<'SQL'
SELECT 'patients: '  || count(*) FROM patients;
SELECT 'visits: '    || count(*) FROM visits;
SELECT 'today: '     || count(*) FROM visits WHERE visit_date = kampala_today();
SELECT 'rx orders: ' || count(*) FROM prescription_orders;
SELECT 'payments: '  || count(*) || ' (paid ' || count(*) FILTER (WHERE status='paid') || ', waived ' || count(*) FILTER (WHERE status='waived') || ')' FROM payments;
SELECT 'receipts auto-numbered: ' || count(*) FROM payments WHERE receipt_number LIKE 'KH-STM-%';
SELECT 'charges: '   || count(*) || ' = UGX ' || sum(amount_ugx) FROM charges;
SELECT 'hmis-coded visits: ' || count(DISTINCT visit_id) FROM visit_diagnosis_codes;
SELECT 'stock ledger reconciles: ' || bool_and(ok) FROM (
  SELECT i.id, i.quantity_on_hand = COALESCE(sum(m.quantity_delta),0) AS ok
  FROM pharmacy_stock_items i LEFT JOIN pharmacy_stock_movements m ON m.stock_item_id = i.id
  GROUP BY i.id, i.quantity_on_hand) s;
SELECT 'admission active: ' || count(*) FROM admissions WHERE status='active';
SELECT 'anc contacts: ' || count(*) FROM anc_contacts;
SQL

echo "== worklist buckets (expected: waiting 1, needs_vitals(opd) 1, with_clinician 3, awaiting_labs 1, at_pharmacy 1, done_today 2 | wl: vitals 2, lab 1, pharmacy 1, payment 1)"
"$PGBIN/psql" -v ON_ERROR_STOP=1 -qtA <<'SQL'
SELECT 'opd all: '            || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', NULL);
SELECT 'opd waiting: '        || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'waiting');
SELECT 'opd needs_vitals: '   || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'needs_vitals');
SELECT 'opd with_clinician: ' || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'with_clinician');
SELECT 'opd awaiting_labs: '  || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'awaiting_labs');
SELECT 'opd at_pharmacy: '    || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'at_pharmacy');
SELECT 'opd done_today: '     || count(*) FROM rpc_get_opd_patients_today('00000000-0000-0000-0000-00000000d310', 'done_today');
SELECT 'wl needs_vitals: '    || count(*) FROM rpc_worklist_needs_vitals('00000000-0000-0000-0000-00000000d310');
SELECT 'wl needs_lab: '       || count(*) FROM rpc_worklist_needs_lab('00000000-0000-0000-0000-00000000d310');
SELECT 'wl needs_pharmacy: '  || count(*) FROM rpc_worklist_needs_pharmacy('00000000-0000-0000-0000-00000000d310');
SELECT 'wl needs_payment: '   || count(*) FROM rpc_worklist_needs_payment('00000000-0000-0000-0000-00000000d310');
SQL

echo "== applying 99_reset_and_reseed.sql"
apply sql-editor/99_reset_and_reseed.sql
"$PGBIN/psql" -qtA -c "SELECT 'clinics after reset: ' || count(*) FROM clinics"

echo "== BUNDLE OK"
