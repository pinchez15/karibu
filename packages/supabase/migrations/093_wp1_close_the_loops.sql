-- =============================================================================
-- 093 — WP1 Close the loops (pharmacy send-back, lab results-ready, care tasks)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part A: dispensing_status 'returned' + aggregate semantics
-- -----------------------------------------------------------------------------

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_dispensing_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_dispensing_status_check CHECK (
  dispensing_status IN (
    'not_started', 'in_progress', 'dispensed', 'partial', 'out_of_stock', 'returned'
  )
);

CREATE OR REPLACE FUNCTION aggregate_visit_dispensing_status(p_visit_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total INT;
  v_dispensed INT;
  v_partial INT;
  v_oos INT;
  v_needs_clar INT;
  v_open INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'dispensed'),
    COUNT(*) FILTER (WHERE status = 'partially_dispensed'),
    COUNT(*) FILTER (WHERE status = 'out_of_stock'),
    COUNT(*) FILTER (WHERE status = 'needs_clarification'),
    COUNT(*) FILTER (WHERE status IN ('ordered', 'dispensing'))
  INTO v_total, v_dispensed, v_partial, v_oos, v_needs_clar, v_open
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  IF v_total = 0 THEN
    RETURN 'not_started';
  END IF;

  IF v_dispensed = v_total THEN
    RETURN 'dispensed';
  END IF;

  IF v_oos = v_total THEN
    RETURN 'out_of_stock';
  END IF;

  -- Clinician must act: ≥1 line needs clarification and nothing in-flight at pharmacy.
  IF v_needs_clar > 0 AND v_open = 0 THEN
    RETURN 'returned';
  END IF;

  IF v_dispensed > 0 OR v_partial > 0 OR v_oos > 0 THEN
    RETURN 'partial';
  END IF;

  IF v_open > 0 OR v_needs_clar > 0 THEN
    RETURN 'in_progress';
  END IF;

  RETURN 'in_progress';
END;
$$ LANGUAGE plpgsql STABLE;

-- Whole-order send-back: use aggregate (was hard-coded 'not_started').
CREATE OR REPLACE FUNCTION rpc_send_pharmacy_back_to_clinician(
  p_visit_id UUID,
  p_reason TEXT,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_reason TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_reason := NULLIF(TRIM(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Reason required when sending back to clinician';
  END IF;

  UPDATE prescription_orders
  SET status = 'needs_clarification'
  WHERE visit_id = p_visit_id
    AND clinic_id = v_clinic_id
    AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock');

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = v_reason,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'send_pharmacy_back', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Pharmacy to-dispense queue excludes returned visits.
CREATE OR REPLACE FUNCTION rpc_worklist_needs_pharmacy(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  medications TEXT,
  dispensing_status TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.medications,
    v.dispensing_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.medications IS NOT NULL
    AND TRIM(v.medications) <> ''
    AND v.pharmacy_order_submitted_at IS NOT NULL
    AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_pharmacy(UUID) TO anon, authenticated;

-- Clinician worklist: pharmacy sent back for clarification.
CREATE OR REPLACE FUNCTION rpc_worklist_pharmacy_returned(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  medications TEXT,
  dispense_notes TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.medications,
    v.dispense_notes,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.dispensing_status = 'returned'
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.updated_at DESC, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_pharmacy_returned(UUID) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Part B: results-ready OPD filter + worklist; abnormal lab → care task
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_get_opd_patients_today(
  p_clinic_id UUID,
  p_filter TEXT DEFAULT NULL
) RETURNS TABLE (
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  visit_id UUID,
  chief_complaint TEXT,
  queue_status TEXT,
  lab_status TEXT,
  dispensing_status TEXT,
  documentation_complete BOOLEAN,
  pharmacy_order_submitted_at TIMESTAMPTZ,
  note_status TEXT,
  visit_date DATE
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  RETURN QUERY
  WITH today_visits AS (
    SELECT DISTINCT ON (v.patient_id)
      v.patient_id,
      v.id AS visit_id,
      v.chief_complaint,
      v.queue_status,
      v.lab_status,
      v.dispensing_status,
      v.documentation_complete,
      v.pharmacy_order_submitted_at,
      v.visit_date,
      pn.status AS note_status
    FROM visits v
    LEFT JOIN provider_notes pn ON pn.visit_id = v.id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date = kampala_today()
    ORDER BY v.patient_id, v.created_at DESC
  )
  SELECT
    tv.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    EXTRACT(YEAR FROM AGE(kampala_today(), p.date_of_birth))::INTEGER,
    tv.visit_id,
    tv.chief_complaint,
    tv.queue_status,
    tv.lab_status,
    tv.dispensing_status,
    tv.documentation_complete,
    tv.pharmacy_order_submitted_at,
    tv.note_status,
    tv.visit_date
  FROM today_visits tv
  JOIN patients p ON p.id = tv.patient_id
  WHERE p_filter IS NULL
    OR (p_filter = 'waiting' AND tv.queue_status = 'waiting')
    OR (p_filter = 'needs_vitals' AND tv.queue_status = 'with_nurse')
    OR (p_filter = 'with_clinician' AND tv.queue_status IN ('ready_for_doctor', 'with_doctor')
        AND COALESCE(tv.documentation_complete, FALSE) = FALSE)
    OR (p_filter = 'awaiting_labs' AND tv.lab_status IN ('pending', 'running'))
    OR (p_filter = 'results_ready' AND tv.lab_status IN ('done', 'abnormal')
        AND COALESCE(tv.documentation_complete, FALSE) = FALSE)
    OR (p_filter = 'pharmacy_returned' AND tv.dispensing_status = 'returned'
        AND COALESCE(tv.documentation_complete, FALSE) = FALSE)
    OR (p_filter = 'at_pharmacy' AND tv.pharmacy_order_submitted_at IS NOT NULL
        AND tv.dispensing_status NOT IN ('dispensed', 'partial', 'returned'))
    OR (p_filter = 'done_today' AND tv.documentation_complete = TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_opd_patients_today(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_worklist_results_ready(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  lab_status TEXT,
  lab_results TEXT,
  lab_abnormal BOOLEAN,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.chief_complaint,
    v.lab_status,
    v.lab_results,
    COALESCE(v.lab_abnormal, FALSE),
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.lab_status IN ('done', 'abnormal')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.lab_completed_at DESC NULLS LAST, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_results_ready(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_record_lab_test_result(
  p_visit_id UUID,
  p_test_name TEXT,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL
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
BEGIN
  v_trimmed_test := NULLIF(TRIM(p_test_name), '');
  v_trimmed_result := NULLIF(TRIM(p_result), '');
  IF v_trimmed_test IS NULL THEN RAISE EXCEPTION 'Test name cannot be empty'; END IF;
  IF v_trimmed_result IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  SELECT clinic_id, patient_id, doctor_id, tests_ordered, lab_test_results
  INTO v_clinic_id, v_patient_id, v_doctor_id, v_tests_ordered, v_results
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
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
    lab_completed_by = CASE WHEN v_derived.all_complete THEN get_current_staff_id() ELSE lab_completed_by END,
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
        NULL
      );
    END IF;
  END IF;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------------------------------
-- Part C: care task RPCs — assert_staff_in_clinic + client_op_id for Android outbox
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS rpc_create_care_task(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS rpc_complete_care_task(UUID);

CREATE OR REPLACE FUNCTION rpc_create_care_task(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_task_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_visit_id UUID DEFAULT NULL,
  p_assignee_role TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_staff_id UUID;
  v_patient_clinic UUID;
  v_task_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT entity_id INTO v_task_id FROM sync_operations
    WHERE client_op_id = p_client_op_id;
    IF v_task_id IS NOT NULL THEN RETURN v_task_id; END IF;
    RETURN gen_random_uuid();
  END IF;

  v_staff_id := get_current_staff_id();

  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  IF v_staff_id IS NULL THEN
    IF p_assignee_id IS NOT NULL THEN
      v_staff_id := p_assignee_id;
    ELSE
      RAISE EXCEPTION 'created_by required (no Clerk staff context, no assignee)';
    END IF;
  END IF;

  INSERT INTO care_tasks (
    clinic_id, patient_id, visit_id,
    task_type, title, description,
    assignee_role, assignee_id, created_by,
    due_at
  ) VALUES (
    p_clinic_id, p_patient_id, p_visit_id,
    p_task_type, p_title, p_description,
    p_assignee_role, p_assignee_id, v_staff_id,
    p_due_at
  ) RETURNING id INTO v_task_id;

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'create_care_task', 'care_tasks', v_task_id
  );

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_create_care_task(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ, UUID
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_complete_care_task(
  p_task_id UUID,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_task_clinic UUID;
  v_staff_id UUID;
BEGIN
  SELECT clinic_id INTO v_task_clinic FROM care_tasks WHERE id = p_task_id;
  IF v_task_clinic IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_task_clinic);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  v_staff_id := get_current_staff_id();

  UPDATE care_tasks
    SET status = 'completed',
        completed_at = NOW(),
        completed_by = v_staff_id
    WHERE id = p_task_id
      AND status != 'completed';

  PERFORM sync_op_record(
    p_client_op_id, v_task_clinic, 'complete_care_task', 'care_tasks', p_task_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_complete_care_task(UUID, UUID) TO anon, authenticated;

-- Backfill: visits with all lines in needs_clarification should show as returned.
UPDATE visits v
SET dispensing_status = 'returned', updated_at = NOW()
WHERE dispensing_status IN ('not_started', 'in_progress')
  AND EXISTS (
    SELECT 1 FROM prescription_orders po
    WHERE po.visit_id = v.id
      AND po.status = 'needs_clarification'
  )
  AND NOT EXISTS (
    SELECT 1 FROM prescription_orders po
    WHERE po.visit_id = v.id
      AND po.status IN ('ordered', 'dispensing')
  );
