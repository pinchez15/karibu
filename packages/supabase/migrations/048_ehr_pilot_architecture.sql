-- Migration 048: EHR pilot architecture — finalize encounter, catalog platform,
-- admissions, protocols, clinic workflow config, scale hygiene, audit/roles.

-- =============================================================================
-- 1. rpc_finalize_clinical_encounter — atomic sign + summary + complete
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

  -- Ensure note row exists and sign in one step (visit_id upsert path).
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

  -- Clinician fallback patient receipt.
  v_summary_id := gen_random_uuid();
  INSERT INTO patient_notes (id, visit_id, content, language, source, status, created_at, updated_at)
  VALUES (v_summary_id, p_visit_id, p_patient_summary, 'en', 'clinician_fallback', 'draft', NOW(), NOW())
  ON CONFLICT (visit_id, source) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = NOW();

  -- Visit clinical summary fields.
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
      updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'finalize_clinical_encounter', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_finalize_clinical_encounter(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- =============================================================================
-- 2. provider_notes.updated_by + audit trigger refresh
-- =============================================================================

ALTER TABLE provider_notes
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES staff(id);

CREATE OR REPLACE FUNCTION log_provider_note_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.transcript IS DISTINCT FROM NEW.transcript OR
    OLD.note_content IS DISTINCT FROM NEW.note_content OR
    OLD.status IS DISTINCT FROM NEW.status
  ) THEN
    INSERT INTO audit_logs (
      actor_id, actor_type, action, resource_type, resource_id, metadata
    ) VALUES (
      COALESCE(NEW.updated_by, get_current_staff_id()),
      'staff',
      CASE
        WHEN OLD.status = 'draft' AND NEW.status = 'signed' THEN 'sign_note'
        WHEN OLD.status <> NEW.status THEN 'note_status_change'
        ELSE 'update_note'
      END,
      'provider_note',
      NEW.id,
      jsonb_build_object(
        'visit_id', NEW.visit_id,
        'patient_id', NEW.patient_id,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'content_changed', OLD.transcript IS DISTINCT FROM NEW.transcript
          OR OLD.note_content IS DISTINCT FROM NEW.note_content
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. Clinic catalog platform — codes + ordering
-- =============================================================================

ALTER TABLE clinic_lab_capabilities
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE clinic_pharmacy_formulary
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_clinic_lab_capabilities_code
  ON clinic_lab_capabilities(clinic_id, code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_pharmacy_formulary_code
  ON clinic_pharmacy_formulary(clinic_id, code) WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION rpc_get_clinic_catalog(p_clinic_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  RETURN jsonb_build_object(
    'labs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'test_name', test_name,
          'code', code,
          'category', category,
          'display_order', display_order,
          'is_available', is_available AND active,
          'notes', notes
        ) ORDER BY display_order, test_name
      )
      FROM clinic_lab_capabilities
      WHERE clinic_id = p_clinic_id AND active = TRUE
    ), '[]'::jsonb),
    'formulary', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drug_name', drug_name,
          'code', code,
          'category', category,
          'display_order', display_order,
          'is_available', is_available AND active,
          'notes', notes
        ) ORDER BY display_order, drug_name
      )
      FROM clinic_pharmacy_formulary
      WHERE clinic_id = p_clinic_id AND active = TRUE
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_clinic_catalog(UUID) TO anon, authenticated;

-- =============================================================================
-- 4. Clinic workflow config
-- =============================================================================

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS workflow_config JSONB NOT NULL DEFAULT '{
    "default_opd_filters": ["waiting", "needs_vitals", "with_clinician", "awaiting_labs", "at_pharmacy", "done_today"],
    "prominent_departments": ["opd", "anc", "maternity"],
    "show_physical_queue_filter": true,
    "enabled_protocol_slugs": []
  }'::jsonb;

-- =============================================================================
-- 5. Admissions + inpatient
-- =============================================================================

CREATE TABLE IF NOT EXISTS admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_at TIMESTAMPTZ,
  ward_label TEXT,
  chief_complaint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'transferred')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admissions_clinic_status
  ON admissions(clinic_id, status, admitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_admissions_patient
  ON admissions(patient_id, admitted_at DESC);

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visits_admission
  ON visits(admission_id) WHERE admission_id IS NOT NULL;

ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admissions_select ON admissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = admissions.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

CREATE OR REPLACE FUNCTION rpc_admit_patient(
  p_patient_id UUID,
  p_ward_label TEXT DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT id INTO v_admission_id FROM admissions
    WHERE patient_id = p_patient_id AND status = 'active'
    ORDER BY admitted_at DESC LIMIT 1;
    RETURN v_admission_id;
  END IF;

  INSERT INTO admissions (clinic_id, patient_id, ward_label, chief_complaint, created_by)
  VALUES (v_clinic_id, p_patient_id, p_ward_label, p_chief_complaint, get_current_staff_id())
  RETURNING id INTO v_admission_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'admit_patient', 'admissions', v_admission_id);
  RETURN v_admission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_admit_patient(UUID, TEXT, TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- 6. Clinical protocol engine
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinical_protocol_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  trigger_hint TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  lab_bundle JSONB,
  isolation_required BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_protocol_enrollments (
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES clinical_protocol_definitions(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (clinic_id, protocol_id)
);

CREATE TABLE IF NOT EXISTS protocol_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  protocol_id UUID NOT NULL REFERENCES clinical_protocol_definitions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  activated_by UUID NOT NULL REFERENCES staff(id),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_protocol_activations_patient
  ON protocol_activations(patient_id, status);

ALTER TABLE clinical_protocol_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_protocol_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinical_protocol_definitions_select ON clinical_protocol_definitions
  FOR SELECT USING (active = TRUE);

CREATE POLICY clinic_protocol_enrollments_select ON clinic_protocol_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = clinic_protocol_enrollments.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

CREATE POLICY protocol_activations_select ON protocol_activations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = protocol_activations.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

INSERT INTO clinical_protocol_definitions (slug, title, description, trigger_hint, steps, lab_bundle, isolation_required)
VALUES
  (
    'ebola-suspect-v1',
    'Ebola suspect protocol',
    'Suspected Ebola virus disease — isolation, PPE, notify supervisor, send specimens per MOH guidance.',
    'Fever + bleeding, contact with confirmed case, or unexplained hemorrhagic illness',
    '[
      {"type":"care_task","title":"Initiate isolation","assignee_role":"nurse"},
      {"type":"care_task","title":"Notify facility supervisor","assignee_role":"admin"},
      {"type":"care_task","title":"Don PPE before contact","assignee_role":"nurse"}
    ]'::jsonb,
    '["Ebola PCR","Malaria RDT","Full blood count"]'::jsonb,
    TRUE
  ),
  (
    'cholera-suspect-v1',
    'Cholera suspect protocol',
    'Acute watery diarrhea cluster — rehydration, stool specimen, infection control.',
    'Profuse watery diarrhea, dehydration, outbreak context',
    '[
      {"type":"care_task","title":"Start oral/IV rehydration","assignee_role":"nurse"},
      {"type":"care_task","title":"Collect stool specimen","assignee_role":"lab_tech"}
    ]'::jsonb,
    '["Stool culture","RDT cholera if available"]'::jsonb,
    FALSE
  )
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION rpc_activate_clinical_protocol(
  p_patient_id UUID,
  p_protocol_slug TEXT,
  p_visit_id UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_clinic_id UUID;
  v_protocol_id UUID;
  v_activation_id UUID;
  v_step JSONB;
  v_title TEXT;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  SELECT id INTO v_protocol_id FROM clinical_protocol_definitions
  WHERE slug = p_protocol_slug AND active = TRUE;

  IF v_protocol_id IS NULL THEN
    RAISE EXCEPTION 'Protocol not found: %', p_protocol_slug;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM clinic_protocol_enrollments
    WHERE clinic_id = v_clinic_id AND protocol_id = v_protocol_id AND enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'Protocol not enabled for this clinic';
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT id INTO v_activation_id FROM protocol_activations
    WHERE patient_id = p_patient_id AND protocol_id = v_protocol_id AND status = 'active'
    ORDER BY activated_at DESC LIMIT 1;
    RETURN v_activation_id;
  END IF;

  INSERT INTO protocol_activations (clinic_id, patient_id, visit_id, protocol_id, activated_by)
  VALUES (v_clinic_id, p_patient_id, p_visit_id, v_protocol_id, get_current_staff_id())
  RETURNING id INTO v_activation_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(
    (SELECT steps FROM clinical_protocol_definitions WHERE id = v_protocol_id)
  ) LOOP
    IF v_step->>'type' = 'care_task' THEN
      v_title := v_step->>'title';
      v_role := v_step->>'assignee_role';
      PERFORM rpc_create_care_task(
        v_clinic_id,
        p_patient_id,
        'general',
        v_title,
        'Auto-created by protocol ' || p_protocol_slug,
        p_visit_id,
        v_role,
        NULL,
        NULL
      );
    END IF;
  END LOOP;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'activate_clinical_protocol', 'protocol_activations', v_activation_id);
  RETURN v_activation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_activate_clinical_protocol(UUID, TEXT, UUID, UUID) TO anon, authenticated;

-- =============================================================================
-- 7. Draft-stage AI assist (attending model — questions only)
-- =============================================================================

ALTER TABLE ai_review_suggestions
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'post_sign'
    CHECK (phase IN ('draft', 'pre_sign', 'post_sign'));

CREATE OR REPLACE FUNCTION rpc_request_draft_ai_assist(
  p_visit_id UUID,
  p_sections_snapshot JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- Client calls web/Inngest for model inference; RPC records intent + gates access.
  UPDATE visits
  SET ai_review_status = CASE
    WHEN ai_review_status IN ('completed', 'running') THEN ai_review_status
    ELSE 'pending'
  END,
  updated_at = NOW()
  WHERE id = p_visit_id;

  RETURN jsonb_build_object(
    'visit_id', p_visit_id,
    'phase', 'draft',
    'queued', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_request_draft_ai_assist(UUID, JSONB) TO anon, authenticated;

-- =============================================================================
-- 8. Scale hygiene — indexes, bounded worklists, sync retention
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_visits_patient_visit_date
  ON visits(patient_id, visit_date DESC);

CREATE OR REPLACE FUNCTION purge_old_sync_operations(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM sync_operations
  WHERE applied_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION purge_old_sync_operations(INTEGER) TO service_role;

-- Bound lab worklist to rolling 7 days.
CREATE OR REPLACE FUNCTION rpc_worklist_needs_lab(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  lab_status TEXT,
  doctor_id UUID,
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
  SELECT
    v.id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INTEGER,
    v.chief_complaint,
    v.lab_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date >= CURRENT_DATE - INTERVAL '7 days'
    AND v.tests_ordered IS NOT NULL
    AND TRIM(v.tests_ordered) <> ''
    AND v.lab_status IN ('pending', 'running');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_lab(UUID) TO anon, authenticated;

-- =============================================================================
-- 9. Provider notes RLS — all clinic staff can read (writes still via RPC)
-- =============================================================================

DROP POLICY IF EXISTS "provider_notes_select_policy" ON provider_notes;

CREATE POLICY "provider_notes_select_policy" ON provider_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      JOIN staff s ON s.clinic_id = p.clinic_id
      WHERE p.id = provider_notes.patient_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

-- =============================================================================
-- 10. OPD patient list RPC — one row per patient (today)
-- =============================================================================

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
      AND v.visit_date = CURRENT_DATE
    ORDER BY v.patient_id, v.created_at DESC
  )
  SELECT
    tv.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INTEGER,
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
    OR (p_filter = 'at_pharmacy' AND tv.pharmacy_order_submitted_at IS NOT NULL
        AND tv.dispensing_status NOT IN ('dispensed', 'partial'))
    OR (p_filter = 'done_today' AND tv.documentation_complete = TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_opd_patients_today(UUID, TEXT) TO anon, authenticated;
