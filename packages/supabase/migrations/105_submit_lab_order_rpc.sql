-- 105_submit_lab_order_rpc.sql
--
-- Hotfix for the two Android sync-stuck errors surfaced by the 1.0.32 field
-- report (2026-07-09 tablet screenshots):
--
--   "submit_lab_order: Unable to create @Body converter for
--    java.util.Map<java.lang.String, java.lang.Object>"
--
-- Android's `submit_lab_order` op (and the inpatient visit-create path) were
-- the last two writes using direct PostgREST (`PATCH /visits`, `POST /visits`)
-- with a Map body that the kotlinx-serialization Retrofit converter cannot
-- serialize — the request never left the device, and it also violated the
-- locked "all writes via SECURITY DEFINER RPCs" rule
-- (docs/ehr-pivot-implementation.md §3.2, CI: scripts/audit-android-postgrest.sh).
--
-- 1. rpc_submit_lab_order — replaces Android's PATCH /visits for lab ordering.
--    Idempotent via the sync_operations ledger (gate first, matching 101).
-- 2. rpc_create_visit gains p_admission_id (visits.admission_id exists since
--    048) — replaces Android's POST /visits for inpatient-linked visits.
--    Body verbatim from 095_wp2_day_line_checkin.sql:150-180 plus the new
--    column; old signature dropped (PostgREST cannot disambiguate overloads).

BEGIN;

-- =============================================================================
-- 1. rpc_submit_lab_order
-- =============================================================================
-- No role restriction beyond clinic membership: the PATCH it replaces had
-- none, and any clinical staff may order labs (mirrors VisitLabPanel roles
-- client-side). lab_test_results is only overwritten when provided.

CREATE OR REPLACE FUNCTION rpc_submit_lab_order(
  p_visit_id UUID,
  p_tests_ordered TEXT,
  p_lab_status TEXT DEFAULT 'pending',
  p_lab_test_results JSONB DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  -- Replay gate before existence checks (101 convention): an already-applied
  -- op returns success regardless of current state.
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF p_lab_status NOT IN ('not_ordered', 'pending', 'running', 'done', 'abnormal') THEN
    RAISE EXCEPTION 'Invalid lab_status %', p_lab_status;
  END IF;

  UPDATE visits
  SET
    tests_ordered = p_tests_ordered,
    lab_status = p_lab_status,
    lab_test_results = COALESCE(p_lab_test_results, lab_test_results),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, v_clinic_id, 'submit_lab_order', 'visits', p_visit_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_submit_lab_order(UUID, TEXT, TEXT, JSONB, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 2. rpc_create_visit + p_admission_id — body verbatim from 095 + one column
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_create_visit(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT);

CREATE OR REPLACE FUNCTION rpc_create_visit(
  p_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT kampala_today(),
  p_department TEXT DEFAULT 'opd',
  p_admission_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_queue_position INTEGER;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  v_queue_position := assign_today_number(p_clinic_id, p_visit_date);

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority, queue_position, checked_in_at,
    admission_id
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    p_department, 'pending', 'waiting', 'normal', v_queue_position, NOW(),
    p_admission_id
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_create_visit(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT, UUID)
  TO anon, authenticated;

COMMIT;
