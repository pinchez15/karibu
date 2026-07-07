-- 099_care_task_service_role_creator.sql
-- Fix: lab tech marking a result "Abnormal" on web fails with
--   "created_by required (no Clerk staff context, no assignee)"
-- for any visit with no assigned doctor.
--
-- Root cause: WP1 (094) made an abnormal lab result auto-create a
-- `lab_followup` care task. Web server actions call the lab RPC through the
-- service-role client (no Clerk JWT), so inside rpc_create_care_task
-- get_current_staff_id() is NULL. created_by then fell back to the assignee
-- (the visit's doctor_id); when the visit had no doctor, both were NULL and the
-- function raised — rolling back the whole (single-transaction) lab result
-- write. So the lab tech could not record an abnormal result at all.
--
-- Fix follows the established service-role attribution pattern (see the
-- payments RPC in 063 ~L892): web server actions pass the acting staff id, and
-- the RPC uses it when karibu_is_service_role(). We thread the recording staff
-- through rpc_record_lab_test_result -> rpc_create_care_task as the creator, so
-- created_by is always attributable and an unassigned abnormal result still
-- opens a follow-up task (unassigned = visible to all in the care-tasks
-- worklist) instead of failing.
--
-- Both functions gain a trailing DEFAULT NULL param, so existing callers
-- (Android outbox, other server actions) keep working unchanged. Android uses
-- an authenticated Clerk JWT, so it resolves the actor via get_current_staff_id()
-- and never sends the new param.

BEGIN;

-- ============================================================================
-- 1. rpc_create_care_task — accept an explicit creator for service-role callers
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_create_care_task(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ, UUID);

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
  p_client_op_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
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

  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  -- Attribution: authenticated clients (Android) record as themselves; a
  -- service-role web action supplies the acting staff id via p_created_by.
  -- Fall back to the assignee only if nothing else is available.
  IF karibu_is_service_role() THEN
    v_staff_id := COALESCE(p_created_by, p_assignee_id);
  ELSE
    v_staff_id := COALESCE(get_current_staff_id(), p_created_by, p_assignee_id);
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'created_by required (no Clerk staff context, no assignee)';
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
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ, UUID, UUID
) TO anon, authenticated;

-- ============================================================================
-- 2. rpc_record_lab_test_result — thread the recording staff to the care task
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_record_lab_test_result(UUID, TEXT, TEXT, BOOLEAN, UUID);

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
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  -- Authenticated clients record as themselves; a service-role web action
  -- supplies the acting lab tech id via p_recorded_by. Role gate is enforced
  -- by the web action (assertLabTech) for service-role callers.
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
        COALESCE(v_doctor_id, v_actor)  -- p_created_by: doctor, else recording lab tech
      );
    END IF;
  END IF;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_record_lab_test_result(
  UUID, TEXT, TEXT, BOOLEAN, UUID, UUID
) TO anon, authenticated;

COMMIT;
