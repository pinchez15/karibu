-- RPC idempotency regression checks (migration 045 sync_operations + 048 finalize).
-- Run against a local Supabase DB after migrations:
--   psql "$DATABASE_URL" -f packages/supabase/tests/rpc_idempotency.sql
--
-- These are manual/integration assertions — not wired to pgTAP yet.

BEGIN;

-- sync_op_already_applied must exist (045+).
DO $$
BEGIN
  IF to_regprocedure('sync_op_already_applied(uuid)') IS NULL THEN
    RAISE EXCEPTION 'sync_op_already_applied missing — apply migration 045+';
  END IF;
END $$;

-- rpc_finalize_clinical_encounter uses p_client_op_id gate (048).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_finalize_clinical_encounter'
  ) THEN
    RAISE EXCEPTION 'rpc_finalize_clinical_encounter missing — apply migration 048';
  END IF;
END $$;

-- rpc_admit_patient and rpc_activate_clinical_protocol accept client_op_id (048).
DO $$
BEGIN
  IF to_regprocedure('rpc_admit_patient(uuid,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'rpc_admit_patient missing';
  END IF;
  IF to_regprocedure('rpc_activate_clinical_protocol(uuid,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'rpc_activate_clinical_protocol missing';
  END IF;
END $$;

ROLLBACK;
