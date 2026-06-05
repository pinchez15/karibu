-- Clinical sign/finalize marks documentation complete but left queue_status at
-- with_doctor, so patients stayed in "With me" / open encounters until payment.
-- Payment is decoupled (EHR pivot); bursar uses needs_payment / Billing.

-- Backfill today's stuck rows (signed off but still with_doctor).
UPDATE visits
SET queue_status = 'completed',
    updated_at = NOW()
WHERE visit_date = CURRENT_DATE
  AND COALESCE(documentation_complete, FALSE) = TRUE
  AND queue_status IN ('with_doctor', 'ready_for_doctor');

-- =============================================================================
-- 1. rpc_finalize_clinical_encounter — release clinician queue on sign
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
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. rpc_mark_documentation_complete — same queue release (legacy Android ops)
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. rpc_worklist_needs_clinician — exclude signed-off visits
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_worklist_needs_clinician(
  p_clinic_id UUID,
  p_department TEXT DEFAULT 'opd'
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  queue_status TEXT,
  priority TEXT,
  doctor_id UUID,
  checked_in_at TIMESTAMPTZ,
  wait_minutes INTEGER
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = p_clinic_id
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v.id AS visit_id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    p.sex,
    patient_age_years(p.id) AS derived_age,
    v.chief_complaint,
    v.queue_status,
    v.priority,
    v.doctor_id,
    v.checked_in_at,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = CURRENT_DATE
    AND v.queue_status IN ('ready_for_doctor', 'with_doctor')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY
    CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
    v.queue_position NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
