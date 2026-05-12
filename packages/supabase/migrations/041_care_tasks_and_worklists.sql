-- Migration 041: care_tasks + worklist RPCs (Phase 5)
--
-- Step 5 of docs/patient-centered-architecture-plan.md.
-- Adds the care_tasks table (follow-up worklists that don't fit the
-- visit/queue state machine) plus a set of worklist RPCs that filter
-- visits/notes/tasks for each operational role. The HC III role-specific
-- homes (docs/hc3-rollout-plan.md) will consume these directly.
--
-- The existing queue (visits.queue_status, get_clinic_queue) stays — it's
-- still the right shape for the "patient is physically here and waiting"
-- case. Worklists add the complementary "go get this patient when you can"
-- pattern: needs-vitals, needs-lab, needs-pharmacy, needs-payment, my
-- drafts, plus arbitrary follow-up tasks.

-- =============================================================================
-- 1. care_tasks — follow-up worklist primitive
-- =============================================================================

CREATE TABLE IF NOT EXISTS care_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,

  task_type TEXT NOT NULL CHECK (task_type IN (
    'lab_followup',
    'phone_callback',
    'home_visit',
    'medication_review',
    'referral_followup',
    'general'
  )),

  title TEXT NOT NULL,
  description TEXT,

  assignee_role TEXT CHECK (assignee_role IS NULL OR assignee_role IN (
    'admin','doctor','nurse','clinical_officer','midwife',
    'nursing_assistant','records_officer','lab_tech','dispenser'
  )),
  assignee_id UUID REFERENCES staff(id) ON DELETE SET NULL,

  created_by UUID NOT NULL REFERENCES staff(id),

  due_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'completed', 'cancelled'
  )),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES staff(id),
  cancel_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_tasks_clinic_status_due
  ON care_tasks(clinic_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_care_tasks_patient_status
  ON care_tasks(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_care_tasks_assignee_status
  ON care_tasks(assignee_id, status) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_care_tasks_role_status
  ON care_tasks(clinic_id, assignee_role, status) WHERE assignee_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_care_tasks_visit
  ON care_tasks(visit_id) WHERE visit_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_care_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_care_tasks_updated_at_trigger ON care_tasks;
CREATE TRIGGER update_care_tasks_updated_at_trigger
  BEFORE UPDATE ON care_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_care_tasks_updated_at();

-- RLS: clinic-scoped reads. Writes via RPCs only.
ALTER TABLE care_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_tasks_select ON care_tasks;
CREATE POLICY care_tasks_select ON care_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = care_tasks.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

-- =============================================================================
-- 2. CRUD RPCs for care_tasks
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_create_care_task(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_task_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_visit_id UUID DEFAULT NULL,
  p_assignee_role TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_caller_clinic UUID;
  v_staff_id UUID;
  v_patient_clinic UUID;
  v_task_id UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_staff_id := get_current_staff_id();

  -- Patient must be in the requested clinic.
  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  -- Caller must belong to the same clinic (service-role passes through
  -- when v_caller_clinic IS NULL).
  IF v_caller_clinic IS NOT NULL AND v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: caller clinic mismatch';
  END IF;

  IF v_staff_id IS NULL THEN
    -- Service-role caller: created_by is required NOT NULL. Use the
    -- assignee_id if present as a sensible fallback; otherwise fail.
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

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_create_care_task(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_complete_care_task(
  p_task_id UUID
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_task_clinic UUID;
  v_staff_id UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_staff_id := get_current_staff_id();

  SELECT clinic_id INTO v_task_clinic FROM care_tasks WHERE id = p_task_id;
  IF v_task_clinic IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_caller_clinic IS NOT NULL AND v_caller_clinic != v_task_clinic THEN
    RAISE EXCEPTION 'Unauthorized: caller clinic mismatch';
  END IF;

  UPDATE care_tasks
    SET status = 'completed',
        completed_at = NOW(),
        completed_by = v_staff_id
    WHERE id = p_task_id
      AND status != 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_complete_care_task(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_cancel_care_task(
  p_task_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_task_clinic UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  SELECT clinic_id INTO v_task_clinic FROM care_tasks WHERE id = p_task_id;
  IF v_task_clinic IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_caller_clinic IS NOT NULL AND v_caller_clinic != v_task_clinic THEN
    RAISE EXCEPTION 'Unauthorized: caller clinic mismatch';
  END IF;

  UPDATE care_tasks
    SET status = 'cancelled',
        cancel_reason = p_reason
    WHERE id = p_task_id
      AND status NOT IN ('completed', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_cancel_care_task(UUID, TEXT) TO anon, authenticated;

-- =============================================================================
-- 3. Worklist RPCs — pull patients by role
-- =============================================================================
-- All worklist RPCs follow the same auth pattern: explicit p_clinic_id,
-- Clerk callers must be staff at that clinic, service-role passes through.

-- 3a. Needs vitals — visits checked in today without a vitals row yet.
CREATE OR REPLACE FUNCTION rpc_worklist_needs_vitals(
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
  checked_in_at TIMESTAMPTZ
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
    v.checked_in_at
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = CURRENT_DATE
    AND v.queue_status IN ('waiting', 'with_nurse')
    AND NOT EXISTS (
      SELECT 1 FROM patient_vitals pv
      WHERE pv.visit_id = v.id
    )
  ORDER BY v.checked_in_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_vitals(UUID, TEXT) TO anon, authenticated;

-- 3b. Needs clinician — visits ready_for_doctor or with_doctor (active load).
-- Complements get_clinic_queue: same data, but framed as "pull list" with
-- patient identity fields the worklist UI cares about.
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
  ORDER BY
    CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
    v.queue_position NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_clinician(UUID, TEXT) TO anon, authenticated;

-- 3c. Needs lab — visits with lab_status in (pending, running).
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
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.chief_complaint,
    v.lab_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.lab_status IN ('pending', 'running')
  ORDER BY v.visit_date DESC, v.checked_in_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_lab(UUID) TO anon, authenticated;

-- 3d. Needs pharmacy — visits with documentation_complete and dispensing
-- not yet finished.
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
    AND v.documentation_complete = TRUE
    AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  ORDER BY v.visit_date DESC, v.documentation_completed_at NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_pharmacy(UUID) TO anon, authenticated;

-- 3e. Needs payment — visits at status='sent' with no payment row.
CREATE OR REPLACE FUNCTION rpc_worklist_needs_payment(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  diagnosis TEXT,
  visit_date DATE,
  documentation_completed_at TIMESTAMPTZ
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
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.diagnosis,
    v.visit_date,
    v.documentation_completed_at
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.status = 'sent'
    AND NOT EXISTS (
      SELECT 1 FROM payments py WHERE py.visit_id = v.id AND py.status = 'paid'
    )
  ORDER BY v.visit_date DESC, v.documentation_completed_at NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_payment(UUID) TO anon, authenticated;

-- 3f. My draft notes — provider_notes in draft status created by caller.
-- For service-role callers (no Clerk JWT), pass p_staff_id explicitly.
CREATE OR REPLACE FUNCTION rpc_worklist_my_drafts(
  p_clinic_id UUID,
  p_staff_id UUID DEFAULT NULL
) RETURNS TABLE (
  note_id UUID,
  patient_id UUID,
  patient_name TEXT,
  visit_id UUID,
  source TEXT,
  transcript_preview TEXT,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_staff_id UUID;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  IF v_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_staff_id FROM staff
      WHERE clerk_user_id = v_clerk_user_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  ELSE
    -- Service-role caller must pass p_staff_id explicitly.
    IF p_staff_id IS NULL THEN
      RAISE EXCEPTION 'p_staff_id required for service-role caller';
    END IF;
    v_staff_id := p_staff_id;
  END IF;

  RETURN QUERY
  SELECT
    pn.id AS note_id,
    pn.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    pn.visit_id,
    pn.source,
    LEFT(COALESCE(pn.transcript, ''), 200) AS transcript_preview,
    pn.updated_at
  FROM provider_notes pn
  JOIN patients p ON p.id = pn.patient_id
  WHERE p.clinic_id = p_clinic_id
    AND pn.status = 'draft'
    -- Best-effort author attribution: a draft note's author isn't recorded
    -- until sign. Filter to drafts created (in upsert metadata) by anyone
    -- in this clinic, then the UI shows the full list; for now we use the
    -- conservative interpretation — show all clinic drafts to the caller.
  ORDER BY pn.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_my_drafts(UUID, UUID) TO anon, authenticated;

-- 3g. Open care tasks — by role and/or assignee.
CREATE OR REPLACE FUNCTION rpc_worklist_care_tasks(
  p_clinic_id UUID,
  p_assignee_role TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_task_type TEXT DEFAULT NULL
) RETURNS TABLE (
  task_id UUID,
  patient_id UUID,
  patient_name TEXT,
  visit_id UUID,
  task_type TEXT,
  title TEXT,
  description TEXT,
  assignee_role TEXT,
  assignee_id UUID,
  due_at TIMESTAMPTZ,
  status TEXT,
  created_at TIMESTAMPTZ
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
    ct.id, ct.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    ct.visit_id,
    ct.task_type, ct.title, ct.description,
    ct.assignee_role, ct.assignee_id,
    ct.due_at, ct.status,
    ct.created_at
  FROM care_tasks ct
  JOIN patients p ON p.id = ct.patient_id
  WHERE ct.clinic_id = p_clinic_id
    AND ct.status IN ('open', 'in_progress')
    AND (p_assignee_role IS NULL OR ct.assignee_role = p_assignee_role OR ct.assignee_role IS NULL)
    AND (p_assignee_id IS NULL OR ct.assignee_id = p_assignee_id OR ct.assignee_id IS NULL)
    AND (p_task_type IS NULL OR ct.task_type = p_task_type)
  ORDER BY
    ct.due_at NULLS LAST,
    ct.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_care_tasks(UUID, TEXT, UUID, TEXT) TO anon, authenticated;
