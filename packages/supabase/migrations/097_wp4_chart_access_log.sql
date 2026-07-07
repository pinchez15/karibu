-- 097_wp4_chart_access_log.sql
-- WP4 Stage 1 — chart access log + HIV/TB anon grant hardening
--
-- Default-open chart reads within a clinic are audited (one row per
-- staff/patient/day). Staff-patients can list who viewed their record;
-- clinic admins can view any patient's access list for in-charge workflows.
--
-- Also REVOKEs anon EXECUTE on the HIV/TB read/HMIS RPCs from 088 — defense
-- in depth alongside assert_staff_in_clinic (063).

BEGIN;

-- =============================================================================
-- 1. chart_access_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS chart_access_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  surface       TEXT NOT NULL,
  accessed_on   DATE NOT NULL DEFAULT kampala_today(),
  first_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count  INTEGER NOT NULL DEFAULT 1 CHECK (access_count >= 1),
  UNIQUE (staff_id, patient_id, accessed_on)
);

CREATE INDEX IF NOT EXISTS idx_chart_access_log_clinic_day
  ON chart_access_log (clinic_id, accessed_on DESC);

CREATE INDEX IF NOT EXISTS idx_chart_access_log_patient
  ON chart_access_log (patient_id, accessed_on DESC);

ALTER TABLE chart_access_log ENABLE ROW LEVEL SECURITY;

-- Reads/writes go through SECURITY DEFINER RPCs (service role bypasses RLS).

-- =============================================================================
-- 2. rpc_log_chart_access — upsert one row per staff/patient/day
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_log_chart_access(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_surface TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_surface TEXT;
  v_today DATE := kampala_today();
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  v_staff_id := get_current_staff_id();
  v_surface := NULLIF(TRIM(p_surface), '');
  IF v_surface IS NULL THEN
    RAISE EXCEPTION 'surface is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM patients
    WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  INSERT INTO chart_access_log (
    clinic_id, staff_id, patient_id, surface, accessed_on
  ) VALUES (
    p_clinic_id, v_staff_id, p_patient_id, v_surface, v_today
  )
  ON CONFLICT (staff_id, patient_id, accessed_on) DO UPDATE
    SET
      last_at = NOW(),
      access_count = chart_access_log.access_count + 1,
      surface = EXCLUDED.surface;
END;
$$;

REVOKE ALL ON FUNCTION rpc_log_chart_access(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_log_chart_access(UUID, UUID, TEXT)
  TO authenticated, service_role;

-- =============================================================================
-- 3. rpc_chart_access_for_patient — staff-patient self-service (+ admin)
-- =============================================================================
--
-- MVP identity link: caller's staff.email matches patient whatsapp_number or
-- national_id (case-insensitive). Clinics often register staff-as-patients with
-- a phone number that will NOT match email — those rows need manual linking in
-- a later WP4 stage (restricted records / linked_staff_id). Clinic admins may
-- always view the list for operational oversight.

CREATE OR REPLACE FUNCTION rpc_chart_access_for_patient(p_patient_id UUID)
RETURNS TABLE (
  staff_display_name TEXT,
  surface TEXT,
  accessed_on DATE,
  first_at TIMESTAMPTZ,
  last_at TIMESTAMPTZ,
  access_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_staff_id UUID;
  v_staff_email TEXT;
  v_staff_role TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT p.clinic_id INTO v_clinic_id
  FROM patients p
  WHERE p.id = p_patient_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  SELECT s.id, lower(trim(s.email)), s.role
  INTO v_staff_id, v_staff_email, v_staff_role
  FROM staff s
  WHERE s.clerk_user_id = auth.jwt()->>'sub'
    AND s.clinic_id = v_clinic_id
    AND s.is_active = TRUE
    AND s.deactivated_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;

  IF v_staff_role = 'admin' THEN
    v_allowed := TRUE;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM patients p
      WHERE p.id = p_patient_id
        AND p.clinic_id = v_clinic_id
        AND (
          lower(trim(COALESCE(p.whatsapp_number, ''))) = v_staff_email
          OR lower(trim(COALESCE(p.national_id, ''))) = v_staff_email
        )
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to view chart access for this patient';
  END IF;

  RETURN QUERY
  SELECT
    s.display_name,
    cal.surface,
    cal.accessed_on,
    cal.first_at,
    cal.last_at,
    cal.access_count
  FROM chart_access_log cal
  JOIN staff s ON s.id = cal.staff_id
  WHERE cal.patient_id = p_patient_id
    AND cal.clinic_id = v_clinic_id
  ORDER BY cal.last_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION rpc_chart_access_for_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_chart_access_for_patient(UUID)
  TO authenticated, service_role;

-- =============================================================================
-- 4. REVOKE anon from sensitive HIV/TB RPCs (088)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION rpc_active_hiv_care(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_active_tb_episodes(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_recent_hts_events(UUID, INT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_hmis_106a_hiv(UUID, INT, INT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_hmis_106a_tb(UUID, INT, INT) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_active_hiv_care(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_active_tb_episodes(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_recent_hts_events(UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_hmis_106a_hiv(UUID, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_hmis_106a_tb(UUID, INT, INT) TO authenticated, service_role;

COMMIT;
