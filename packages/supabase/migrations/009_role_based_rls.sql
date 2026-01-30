-- Migration: Role-Based Access Control and Improved Audit Logging
-- Implements granular permissions based on staff roles

-- Helper function to get current staff's role
CREATE OR REPLACE FUNCTION get_current_staff_role()
RETURNS TEXT AS $$
  SELECT role FROM staff
  WHERE clerk_user_id = auth.jwt()->>'sub'
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE clerk_user_id = auth.jwt()->>'sub'
      AND role = 'admin'
      AND is_active = TRUE
      AND deactivated_at IS NULL
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- =============================================
-- VISITS TABLE RLS POLICIES
-- =============================================

-- Drop existing policies to recreate with role-based logic
DROP POLICY IF EXISTS "Staff can view clinic visits" ON visits;
DROP POLICY IF EXISTS "Staff can create clinic visits" ON visits;
DROP POLICY IF EXISTS "Staff can update clinic visits" ON visits;

-- Admins can view all clinic visits
-- Doctors can view their own visits
-- Nurses can view all visits (needed for queue management)
CREATE POLICY "visits_select_policy" ON visits
  FOR SELECT
  USING (
    clinic_id = get_current_clinic_id()
    AND (
      is_admin()
      OR get_current_staff_role() = 'nurse'
      OR doctor_id = get_current_staff_id()
      OR nurse_id = get_current_staff_id()
    )
  );

-- All staff can create visits in their clinic
CREATE POLICY "visits_insert_policy" ON visits
  FOR INSERT
  WITH CHECK (
    clinic_id = get_current_clinic_id()
  );

-- Doctors can update their own visits
-- Admins can update any visit
-- Nurses cannot update (they use specific functions)
CREATE POLICY "visits_update_policy" ON visits
  FOR UPDATE
  USING (
    clinic_id = get_current_clinic_id()
    AND (
      is_admin()
      OR doctor_id = get_current_staff_id()
    )
  );

-- =============================================
-- PROVIDER NOTES TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Staff can view clinic provider notes" ON provider_notes;
DROP POLICY IF EXISTS "Staff can manage clinic provider notes" ON provider_notes;

-- Doctors and admins can view provider notes
-- Nurses cannot view provider notes (HIPAA compliance - need-to-know)
CREATE POLICY "provider_notes_select_policy" ON provider_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (
          is_admin()
          OR get_current_staff_role() = 'doctor'
        )
    )
  );

-- Only doctors and admins can create/update provider notes
CREATE POLICY "provider_notes_insert_policy" ON provider_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR get_current_staff_role() = 'doctor')
    )
  );

CREATE POLICY "provider_notes_update_policy" ON provider_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR get_current_staff_role() = 'doctor')
    )
  );

-- =============================================
-- PATIENT NOTES TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Staff can view clinic patient notes" ON patient_notes;
DROP POLICY IF EXISTS "Staff can manage clinic patient notes" ON patient_notes;

-- All clinic staff can view patient notes (these are patient-friendly summaries)
CREATE POLICY "patient_notes_select_policy" ON patient_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
    )
  );

-- Only doctors and admins can modify patient notes
CREATE POLICY "patient_notes_insert_policy" ON patient_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR get_current_staff_role() = 'doctor')
    )
  );

CREATE POLICY "patient_notes_update_policy" ON patient_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR get_current_staff_role() = 'doctor')
    )
  );

-- =============================================
-- STAFF TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Staff can view clinic staff" ON staff;

-- All staff can view other staff in their clinic (for queue display, etc.)
CREATE POLICY "staff_select_policy" ON staff
  FOR SELECT
  USING (
    clinic_id = get_current_clinic_id()
    OR clerk_user_id = auth.jwt()->>'sub'
  );

-- Only admins can modify staff (via admin interface)
CREATE POLICY "staff_update_policy" ON staff
  FOR UPDATE
  USING (
    is_admin()
    AND clinic_id = get_current_clinic_id()
  );

-- =============================================
-- PATIENTS TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Staff can view clinic patients" ON patients;
DROP POLICY IF EXISTS "Staff can manage clinic patients" ON patients;

-- All clinic staff can view patients
CREATE POLICY "patients_select_policy" ON patients
  FOR SELECT
  USING (clinic_id = get_current_clinic_id());

-- All clinic staff can create patients
CREATE POLICY "patients_insert_policy" ON patients
  FOR INSERT
  WITH CHECK (clinic_id = get_current_clinic_id());

-- Doctors and admins can update patient info
CREATE POLICY "patients_update_policy" ON patients
  FOR UPDATE
  USING (
    clinic_id = get_current_clinic_id()
    AND (is_admin() OR get_current_staff_role() = 'doctor')
  );

-- =============================================
-- AUDIO UPLOADS TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Staff can view clinic audio uploads" ON audio_uploads;
DROP POLICY IF EXISTS "Staff can manage clinic audio uploads" ON audio_uploads;

-- Only doctors and admins can view audio uploads
CREATE POLICY "audio_uploads_select_policy" ON audio_uploads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR get_current_staff_role() = 'doctor')
    )
  );

-- Doctors can create/update audio uploads for their visits
CREATE POLICY "audio_uploads_insert_policy" ON audio_uploads
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR v.doctor_id = get_current_staff_id())
    )
  );

CREATE POLICY "audio_uploads_update_policy" ON audio_uploads
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM visits v
      WHERE v.id = visit_id
        AND v.clinic_id = get_current_clinic_id()
        AND (is_admin() OR v.doctor_id = get_current_staff_id())
    )
  );

-- =============================================
-- AUDIT LOGGING IMPROVEMENTS
-- =============================================

-- Add index for faster audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Trigger function to automatically log provider note changes
CREATE OR REPLACE FUNCTION log_provider_note_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.note_content IS DISTINCT FROM NEW.note_content OR
    OLD.status IS DISTINCT FROM NEW.status
  ) THEN
    INSERT INTO audit_logs (
      actor_id,
      actor_type,
      action,
      resource_type,
      resource_id,
      metadata
    ) VALUES (
      get_current_staff_id(),
      'staff',
      CASE
        WHEN OLD.status = 'draft' AND NEW.status = 'finalized' THEN 'finalize_note'
        ELSE 'update_note'
      END,
      'provider_note',
      NEW.id,
      jsonb_build_object(
        'visit_id', NEW.visit_id,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'content_changed', OLD.note_content IS DISTINCT FROM NEW.note_content
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for provider note audit logging
DROP TRIGGER IF EXISTS audit_provider_note_changes ON provider_notes;
CREATE TRIGGER audit_provider_note_changes
  AFTER UPDATE ON provider_notes
  FOR EACH ROW
  EXECUTE FUNCTION log_provider_note_changes();

-- Trigger function to log visit status changes
CREATE OR REPLACE FUNCTION log_visit_status_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (
      actor_id,
      actor_type,
      action,
      resource_type,
      resource_id,
      metadata
    ) VALUES (
      get_current_staff_id(),
      CASE WHEN get_current_staff_id() IS NULL THEN 'system' ELSE 'staff' END,
      'status_change',
      'visit',
      NEW.id,
      jsonb_build_object(
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'queue_status', NEW.queue_status
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for visit status audit logging
DROP TRIGGER IF EXISTS audit_visit_status_changes ON visits;
CREATE TRIGGER audit_visit_status_changes
  AFTER UPDATE ON visits
  FOR EACH ROW
  EXECUTE FUNCTION log_visit_status_changes();

-- Restrict direct INSERT to audit_logs (should only happen via triggers/service role)
-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff can only view audit logs for their clinic's resources
CREATE POLICY "audit_logs_select_policy" ON audit_logs
  FOR SELECT
  USING (
    -- Admin can see all logs
    is_admin()
    OR
    -- Staff can see logs for resources they have access to
    (
      resource_type IN ('visit', 'provider_note', 'patient_note') AND
      resource_id IN (
        SELECT v.id FROM visits v WHERE v.clinic_id = get_current_clinic_id()
        UNION
        SELECT pn.id FROM provider_notes pn
        JOIN visits v ON v.id = pn.visit_id
        WHERE v.clinic_id = get_current_clinic_id()
        UNION
        SELECT pan.id FROM patient_notes pan
        JOIN visits v ON v.id = pan.visit_id
        WHERE v.clinic_id = get_current_clinic_id()
      )
    )
  );

-- Only service role can insert audit logs (via triggers)
CREATE POLICY "audit_logs_insert_policy" ON audit_logs
  FOR INSERT
  WITH CHECK (FALSE); -- Disable direct inserts; triggers bypass RLS

-- Grant trigger function execution as service role
ALTER FUNCTION log_provider_note_changes() SECURITY DEFINER;
ALTER FUNCTION log_visit_status_changes() SECURITY DEFINER;
