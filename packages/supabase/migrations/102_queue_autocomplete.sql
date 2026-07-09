-- 102_queue_autocomplete.sql
--
-- Ticket T1 (docs/workplans/2026-07-09-tester-feedback/small-tickets.md) —
-- "queue status auto-completes when the clinical work is done."
--
-- Today, queue completion is a manual, online-only action
-- (rpc_check_out_visit, migration 068) plus two narrow auto-flips baked into
-- rpc_mark_documentation_complete / rpc_finalize_clinical_encounter (050)
-- that only fire when queue_status was already 'with_doctor' or
-- 'ready_for_doctor' at sign time. A visit whose queue_status is still
-- 'waiting' or 'with_nurse' when documentation completes (e.g. a walk-in
-- documented without a full nurse/doctor queue walk) never gets released,
-- which is the tester's "12 waiting at 18:29" report.
--
-- Fix: a single explicit helper, maybe_complete_visit_queue(p_visit_id),
-- called at the end of the write paths that can be "the last one done" for a
-- visit: documentation, each lab-result write, and each pharmacy
-- dispense/status write. It completes the queue from ANY non-terminal state
-- (not just with_doctor/ready_for_doctor) once documentation + lab +
-- pharmacy are all done-or-absent. Payment is explicitly NOT a condition
-- (locked product decision — payment is decoupled from clinical closure).
--
-- This is additive only: every function below is re-created with its
-- existing body preserved byte-for-byte (SECURITY DEFINER, search_path, and
-- grants unchanged) plus one appended `PERFORM maybe_complete_visit_queue(...)`
-- call at the end of the success path.
--
-- COMMUTATION NOTE: four of these functions (rpc_complete_pharmacy_dispense,
-- rpc_record_lab_test_result, rpc_record_lab_result,
-- rpc_finalize_clinical_encounter) are ALSO redefined by migration 101
-- (WP-E replay tolerance, gate-first reordering). Their definitions here are
-- textually identical to 101's (gate-first + appended PERFORM), so the two
-- migrations are order-independent. If you edit one of these four, edit it
-- in BOTH files.
-- call at the end of the success path. Source of each copied body (latest
-- definition found by grep across all prior migrations):
--
--   rpc_finalize_clinical_encounter   <- 050_finalize_clears_clinician_queue.sql:17-119
--   rpc_mark_documentation_complete   <- 050_finalize_clears_clinician_queue.sql:125-153
--   rpc_record_lab_result             <- 045_ehr_pivot.sql:277-314   (only definition)
--   rpc_record_lab_test_result        <- 099_care_task_service_role_creator.sql:107-228
--   rpc_complete_pharmacy_dispense    <- 098_wp3_pharmacy_batches.sql:347-510
--   rpc_set_dispensing_status         <- 064_structured_pharmacy.sql:631-670
--
-- Schema facts this migration relies on (verified by reading the migrations
-- that created them):
--   - visits.queue_status: TEXT, DEFAULT 'waiting', CHECK IN
--     ('waiting','with_nurse','ready_for_doctor','with_doctor','completed','cancelled')
--     — migrations/008_queue_system.sql:8-9. No NOT NULL constraint, so we
--     treat NULL defensively as "not yet completed/cancelled".
--   - visits.lab_status: TEXT NOT NULL DEFAULT 'not_ordered', CHECK IN
--     ('not_ordered','pending','running','done','abnormal')
--     — migrations/031_pharmacy_lab_mvp.sql:51-58. 'not_ordered' is the
--     "no tests ordered" state (no separate NULL case is reachable).
--   - visits.dispensing_status: TEXT NOT NULL DEFAULT 'not_started', CHECK IN
--     ('not_started','in_progress','dispensed','partial','out_of_stock')
--     — migrations/031_pharmacy_lab_mvp.sql:36-42. Only 'dispensed' is a
--     terminal completed state; 'partial' / 'out_of_stock' still require a
--     pharmacist follow-up action, so they do NOT count as done.
--   - visits.pharmacy_order_submitted_at: TIMESTAMPTZ, set when a pharmacy
--     order is actually submitted — migrations/045_ehr_pivot.sql:29-31. NULL
--     means no pharmacy order was ever placed on this visit ("no pharmacy
--     order counts as done" per the ticket).
--   - rpc_check_out_visit (068_decouple_lifecycles.sql:20-45) is the existing
--     manual-checkout semantics we mirror: set queue_status = 'completed',
--     updated_at = NOW(). We additionally guard against re-completing an
--     already-completed or cancelled visit (idempotent; do not touch
--     updated_at on a no-op), and never auto-complete a cancelled visit.

BEGIN;

-- =============================================================================
-- 1. maybe_complete_visit_queue — the shared auto-complete check
-- =============================================================================
-- Internal helper (no GRANT, matching the existing internal-helper pattern —
-- e.g. billing_ensure_consultation_charge, migrations/077:42-71): only called
-- via PERFORM from within other SECURITY DEFINER RPCs that have already
-- authorized the caller for this visit's clinic, so it does not re-assert
-- staff/clinic membership itself.

CREATE OR REPLACE FUNCTION maybe_complete_visit_queue(p_visit_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_lab_done BOOLEAN;
  v_pharmacy_done BOOLEAN;
BEGIN
  SELECT id, queue_status, documentation_complete, lab_status,
         dispensing_status, pharmacy_order_submitted_at
    INTO v_visit
    FROM visits
   WHERE id = p_visit_id;

  IF v_visit.id IS NULL THEN
    RETURN;
  END IF;

  -- Idempotent no-op: already completed (or cancelled — never resurrect a
  -- cancelled visit into the completed queue). Do not touch updated_at.
  IF v_visit.queue_status IS NOT DISTINCT FROM 'completed'
     OR v_visit.queue_status IS NOT DISTINCT FROM 'cancelled' THEN
    RETURN;
  END IF;

  IF COALESCE(v_visit.documentation_complete, FALSE) IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Lab done-or-absent: no tests ordered, or every ordered test reached a
  -- terminal state (done / abnormal).
  v_lab_done := v_visit.lab_status IN ('not_ordered', 'done', 'abnormal');

  -- Pharmacy done-or-absent: fully dispensed, or no pharmacy order was ever
  -- submitted. 'in_progress' / 'partial' / 'out_of_stock' are NOT terminal —
  -- they still need a pharmacist action, so the queue stays open through
  -- those states.
  v_pharmacy_done := v_visit.dispensing_status = 'dispensed'
    OR (v_visit.dispensing_status = 'not_started'
        AND v_visit.pharmacy_order_submitted_at IS NULL);

  IF NOT (v_lab_done AND v_pharmacy_done) THEN
    RETURN;
  END IF;

  -- Payment is deliberately NOT a condition above (locked product decision:
  -- payment is decoupled from clinical closure).
  UPDATE visits
     SET queue_status = 'completed',
         updated_at = NOW()
   WHERE id = p_visit_id
     AND queue_status IS DISTINCT FROM 'completed'
     AND queue_status IS DISTINCT FROM 'cancelled';
END;
$$;

-- =============================================================================
-- 2. rpc_finalize_clinical_encounter — identical to 101 (gate-first + appended call)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_finalize_clinical_encounter(
  p_note_id UUID,
  p_visit_id UUID,
  p_patient_id UUID,
  p_transcript TEXT,
  p_patient_summary TEXT,
  p_diagnosis TEXT DEFAULT NULL,
  p_medications TEXT DEFAULT NULL,
  p_follow_up_instructions TEXT DEFAULT NULL,
  p_tests_ordered TEXT DEFAULT NULL,
  p_structured_data TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_staff_id UUID;
  v_mid_level BOOLEAN;
  v_structured_json JSONB;
  v_summary_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  v_role := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can finalize encounters; role: %', v_role;
  END IF;

  IF p_patient_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found or clinic mismatch';
  END IF;

  v_mid_level := v_role IN ('nurse', 'nursing_assistant');

  IF p_structured_data IS NOT NULL AND TRIM(p_structured_data) <> '' THEN
    v_structured_json := p_structured_data::jsonb;
  END IF;

  INSERT INTO provider_notes (
    id, patient_id, visit_id, transcript, status, source,
    created_by, finalized_at, finalized_by, requires_cosign, updated_by, updated_at
  ) VALUES (
    p_note_id, p_patient_id, p_visit_id, p_transcript, 'signed', 'visit',
    v_staff_id, NOW(), v_staff_id, v_mid_level, v_staff_id, NOW()
  )
  ON CONFLICT (visit_id) WHERE visit_id IS NOT NULL DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        transcript = COALESCE(NULLIF(TRIM(EXCLUDED.transcript), ''), provider_notes.transcript),
        status = 'signed',
        finalized_at = NOW(),
        finalized_by = v_staff_id,
        requires_cosign = v_mid_level,
        structured_data = COALESCE(v_structured_json, provider_notes.structured_data),
        updated_by = v_staff_id,
        updated_at = NOW();

  v_summary_id := gen_random_uuid();
  INSERT INTO patient_notes (id, visit_id, content, language, source, status, created_at, updated_at)
  VALUES (v_summary_id, p_visit_id, p_patient_summary, 'en', 'clinician_fallback', 'draft', NOW(), NOW())
  ON CONFLICT (visit_id, source) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = NOW();

  UPDATE visits
  SET diagnosis = NULLIF(TRIM(p_diagnosis), ''),
      medications = NULLIF(TRIM(p_medications), ''),
      follow_up_instructions = NULLIF(TRIM(p_follow_up_instructions), ''),
      tests_ordered = NULLIF(TRIM(p_tests_ordered), ''),
      lab_status = CASE
        WHEN NULLIF(TRIM(p_tests_ordered), '') IS NOT NULL AND lab_status = 'not_ordered' THEN 'pending'
        WHEN NULLIF(TRIM(p_tests_ordered), '') IS NULL THEN 'not_ordered'
        ELSE lab_status
      END,
      documentation_complete = TRUE,
      documentation_completed_at = COALESCE(documentation_completed_at, NOW()),
      ai_review_status = 'not_started',
      status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
      queue_status = CASE
        WHEN queue_status IN ('with_doctor', 'ready_for_doctor') THEN 'completed'
        ELSE queue_status
      END,
      updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'finalize_clinical_encounter', 'visits', p_visit_id
  );

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_finalize_clinical_encounter(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- =============================================================================
-- 3. rpc_mark_documentation_complete — body verbatim from 050 + appended call
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_mark_documentation_complete(p_visit_id UUID)
  RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic
  FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  UPDATE visits
  SET documentation_complete = TRUE,
      documentation_completed_at = COALESCE(documentation_completed_at, NOW()),
      status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
      queue_status = CASE
        WHEN queue_status IN ('with_doctor', 'ready_for_doctor') THEN 'completed'
        ELSE queue_status
      END,
      updated_at = NOW()
  WHERE id = p_visit_id;

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_mark_documentation_complete(UUID)
  TO anon, authenticated;

-- =============================================================================
-- 4. rpc_record_lab_result — identical to 101 (gate-first + appended call)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_record_lab_result(
  p_visit_id UUID,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_status TEXT;
  v_trimmed TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_trimmed := NULLIF(TRIM(p_result), '');
  IF v_trimmed IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  v_status := CASE WHEN p_abnormal THEN 'abnormal' ELSE 'done' END;

  UPDATE visits
  SET
    lab_status = v_status,
    lab_results = v_trimmed,
    lab_abnormal = p_abnormal,
    lab_completed_at = NOW(),
    lab_completed_by = get_current_staff_id(),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_result', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_record_lab_result(UUID, TEXT, BOOLEAN, UUID) TO anon, authenticated;

-- =============================================================================
-- 5. rpc_record_lab_test_result — identical to 101 (gate-first + appended call)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_record_lab_test_result(
  p_visit_id UUID,
  p_test_name TEXT,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_doctor_role TEXT;
  v_tests_ordered TEXT;
  v_results JSONB;
  v_trimmed_test TEXT;
  v_trimmed_result TEXT;
  v_i INT;
  v_elem JSONB;
  v_new_results JSONB := '[]'::jsonb;
  v_derived RECORD;
  v_status TEXT;
  v_task_title TEXT;
  v_actor UUID;
BEGIN
  v_trimmed_test := NULLIF(TRIM(p_test_name), '');
  v_trimmed_result := NULLIF(TRIM(p_result), '');
  IF v_trimmed_test IS NULL THEN RAISE EXCEPTION 'Test name cannot be empty'; END IF;
  IF v_trimmed_result IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  SELECT clinic_id, patient_id, doctor_id, tests_ordered, lab_test_results
  INTO v_clinic_id, v_patient_id, v_doctor_id, v_tests_ordered, v_results
  FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF karibu_is_service_role() THEN
    v_actor := p_recorded_by;
  ELSE
    IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
      RAISE EXCEPTION 'Unauthorized role';
    END IF;
    v_actor := get_current_staff_id();
  END IF;

  v_results := sync_lab_test_results_array(v_tests_ordered, v_results);
  v_status := CASE WHEN p_abnormal THEN 'abnormal' ELSE 'done' END;

  FOR v_i IN 0..jsonb_array_length(v_results) - 1 LOOP
    v_elem := v_results->v_i;
    IF v_elem->>'test' = v_trimmed_test THEN
      v_elem := jsonb_build_object(
        'test', v_trimmed_test,
        'status', v_status,
        'result', v_trimmed_result,
        'abnormal', p_abnormal,
        'started_at', COALESCE(v_elem->>'started_at', NOW()::text),
        'completed_at', NOW()
      );
    END IF;
    v_new_results := v_new_results || jsonb_build_array(v_elem);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_new_results) AS e WHERE e->>'test' = v_trimmed_test
  ) THEN
    RAISE EXCEPTION 'Test not found on visit';
  END IF;

  SELECT * INTO v_derived FROM derive_visit_lab_state(v_new_results);

  UPDATE visits
  SET
    lab_test_results = v_new_results,
    lab_status = v_derived.lab_status,
    lab_results = v_derived.lab_results,
    lab_abnormal = v_derived.lab_abnormal,
    lab_completed_at = CASE WHEN v_derived.all_complete THEN NOW() ELSE lab_completed_at END,
    lab_completed_by = CASE WHEN v_derived.all_complete THEN COALESCE(v_actor, lab_completed_by) ELSE lab_completed_by END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  IF p_abnormal THEN
    v_task_title := 'Review abnormal lab: ' || v_trimmed_test;
    IF v_doctor_id IS NOT NULL THEN
      SELECT role INTO v_doctor_role FROM staff WHERE id = v_doctor_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM care_tasks
      WHERE visit_id = p_visit_id
        AND task_type = 'lab_followup'
        AND title = v_task_title
        AND status IN ('open', 'in_progress')
    ) THEN
      PERFORM rpc_create_care_task(
        v_clinic_id,
        v_patient_id,
        'lab_followup',
        v_task_title,
        v_trimmed_result,
        p_visit_id,
        v_doctor_role,
        v_doctor_id,
        NULL,
        NULL,
        COALESCE(v_doctor_id, v_actor)
      );
    END IF;
  END IF;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_record_lab_test_result(
  UUID, TEXT, TEXT, BOOLEAN, UUID, UUID
) TO anon, authenticated;

-- =============================================================================
-- 6. rpc_complete_pharmacy_dispense — identical to 101 (gate-first + appended call)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_complete_pharmacy_dispense(
  p_visit_id UUID,
  p_lines JSONB,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL,
  p_dispensed_by UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_line JSONB;
  v_prescription_id UUID;
  v_line_status TEXT;
  v_qty NUMERIC;
  v_qty_unit TEXT;
  v_stock_item_id UUID;
  v_stock_qty NUMERIC;
  v_batch TEXT;
  v_batch_id UUID;
  v_substitute TEXT;
  v_line_notes TEXT;
  v_movement_id UUID;
  v_staff_id UUID;
  v_agg_status TEXT;
  v_prescribed NUMERIC;
  v_already NUMERIC;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one dispense line required';
  END IF;

  v_staff_id := pharmacy_resolve_dispenser_staff_id(v_clinic_id, p_dispensed_by);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_prescription_id := (v_line->>'prescription_order_id')::uuid;
    v_line_status := NULLIF(TRIM(v_line->>'line_status'), '');
    v_qty := NULLIF(v_line->>'quantity_dispensed', '')::numeric;
    v_qty_unit := NULLIF(TRIM(v_line->>'quantity_unit'), '');
    v_stock_item_id := NULLIF(v_line->>'stock_item_id', '')::uuid;
    v_stock_qty := ABS(COALESCE(NULLIF(v_line->>'stock_quantity', '')::numeric, v_qty, 0));
    v_batch := NULLIF(TRIM(v_line->>'batch_number'), '');
    v_batch_id := NULLIF(v_line->>'batch_id', '')::uuid;
    v_substitute := NULLIF(TRIM(v_line->>'substitute_medication_code'), '');
    v_line_notes := NULLIF(TRIM(v_line->>'notes'), '');

    IF v_prescription_id IS NULL OR v_line_status IS NULL THEN
      RAISE EXCEPTION 'Each line requires prescription_order_id and line_status';
    END IF;

    IF v_line_status NOT IN ('dispensed', 'partially_dispensed', 'out_of_stock') THEN
      RAISE EXCEPTION 'Invalid line_status: %', v_line_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM prescription_orders
      WHERE id = v_prescription_id
        AND visit_id = p_visit_id
        AND clinic_id = v_clinic_id
        AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
    ) THEN
      RAISE EXCEPTION 'Prescription line not found or not dispensable: %', v_prescription_id;
    END IF;

    IF v_line_status IN ('dispensed', 'partially_dispensed') AND v_qty IS NOT NULL AND v_qty > 0 THEN
      SELECT quantity_prescribed INTO v_prescribed
      FROM prescription_orders WHERE id = v_prescription_id;
      IF v_prescribed IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity_dispensed), 0) INTO v_already
        FROM dispense_records
        WHERE prescription_order_id = v_prescription_id
          AND line_status IN ('dispensed', 'partially_dispensed');
        IF v_already + v_qty > v_prescribed THEN
          RAISE EXCEPTION
            'Dispensed quantity (% already + % now) exceeds prescribed % for this line',
            v_already, v_qty, v_prescribed;
        END IF;
      END IF;
    END IF;

    v_movement_id := NULL;
    IF v_stock_item_id IS NOT NULL AND v_stock_qty > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_items
        WHERE id = v_stock_item_id AND clinic_id = v_clinic_id AND active
      ) THEN
        RAISE EXCEPTION 'Invalid stock item';
      END IF;

      IF v_batch_id IS NULL THEN
        v_batch_id := rpc_suggest_fefo_batch(v_stock_item_id, v_stock_qty);
      END IF;

      IF v_batch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_batches
        WHERE id = v_batch_id
          AND stock_item_id = v_stock_item_id
          AND clinic_id = v_clinic_id
          AND active
      ) THEN
        RAISE EXCEPTION 'Invalid batch for stock item';
      END IF;

      INSERT INTO pharmacy_stock_movements (
        stock_item_id, clinic_id, movement_type, quantity_delta,
        visit_id, recorded_by, batch_number, notes, prescription_order_id, batch_id
      ) VALUES (
        v_stock_item_id, v_clinic_id, 'dispensed', -v_stock_qty,
        p_visit_id, v_staff_id, v_batch, v_line_notes, v_prescription_id, v_batch_id
      )
      RETURNING id INTO v_movement_id;
    END IF;

    INSERT INTO dispense_records (
      prescription_order_id, visit_id, clinic_id, dispensed_by,
      quantity_dispensed, quantity_unit, line_status,
      substitute_medication_code, stock_item_id, stock_movement_id, notes
    ) VALUES (
      v_prescription_id, p_visit_id, v_clinic_id, v_staff_id,
      v_qty, v_qty_unit, v_line_status,
      v_substitute, v_stock_item_id, v_movement_id, v_line_notes
    );

    UPDATE prescription_orders
    SET status = CASE v_line_status
      WHEN 'dispensed' THEN 'dispensed'
      WHEN 'partially_dispensed' THEN 'partially_dispensed'
      WHEN 'out_of_stock' THEN 'out_of_stock'
    END
    WHERE id = v_prescription_id;

    IF v_line_status IN ('dispensed', 'partially_dispensed') THEN
      PERFORM billing_charge_pharmacy_line(p_visit_id, v_prescription_id);
    END IF;
  END LOOP;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE dispensed_at
    END,
    dispensed_by = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN v_staff_id
      ELSE dispensed_by
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID)
  TO authenticated, service_role;

-- =============================================================================
-- 7. rpc_set_dispensing_status — body verbatim from 064 + appended call
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_set_dispensing_status(
  p_visit_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_status NOT IN ('not_started', 'in_progress', 'dispensed', 'partial', 'out_of_stock') THEN
    RAISE EXCEPTION 'Invalid dispensing status';
  END IF;

  UPDATE visits
  SET
    dispensing_status = p_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE NULL
    END,
    dispensed_by = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN get_current_staff_id()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'set_dispensing_status', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_set_dispensing_status(UUID, TEXT, TEXT, UUID) TO anon, authenticated;

COMMIT;
