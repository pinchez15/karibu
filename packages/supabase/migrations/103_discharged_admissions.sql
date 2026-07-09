-- 103_discharged_admissions.sql
--
-- B1 (docs/workplans/2026-07-09-tester-feedback/inpatient-buildout.md) —
-- "Discharged patients list."
--
-- Gap: the ward census only reads rpc_active_admissions (dashboard/inpatient
-- calls it via dashboard/inpatient/actions.ts), so once an admission is
-- discharged or transferred it disappears from every inpatient view even
-- though the outcome/disposition/discharge_notes/discharged_at data is fully
-- captured on the `admissions` row (migrations 048, 055).
--
-- This adds rpc_discharged_admissions(p_clinic_id, p_from, p_to, p_outcome),
-- mirroring rpc_active_admissions' shape and auth pattern exactly (latest
-- definition: migrations/063_security_hardening.sql, "Base: 053" comment,
-- around line 520 — SECURITY DEFINER, STABLE, SET search_path = public,
-- pg_temp, PERFORM assert_staff_in_clinic(p_clinic_id) first, same
-- patient-name derivation and join), returning the same columns plus
-- discharged_at, outcome, disposition, discharge_notes, status.
--
-- Schema facts verified before writing this:
--   - admissions.status CHECK IN ('active','discharged','transferred')
--     — migrations/048_ehr_pilot_architecture.sql:247.
--   - admissions.ward, bed_label, admission_type, weight_kg, chief_complaint
--     — migrations/053_inpatient_ward_spine.sql:16-29.
--   - admissions.discharged_at, outcome, disposition, discharge_notes,
--     discharged_by — migrations/055_inpatient_discharge.sql:12-16 (added
--     alongside rpc_discharge_admission, which sets status = 'transferred'
--     when disposition = 'referred', else 'discharged'; discharged_at
--     defaults to COALESCE(discharged_at, NOW()) at discharge time).
--   - rpc_active_admissions column list / patient join / clinic assertion —
--     migrations/063_security_hardening.sql (the IDOR-hardened
--     re-definition; the original 053 version had no assert_staff_in_clinic
--     call, so 063 is authoritative).
--   - admission_observations.observed_at for last_observed_at
--     — migrations/053_inpatient_ward_spine.sql:34-57.

BEGIN;

CREATE OR REPLACE FUNCTION rpc_discharged_admissions(
  p_clinic_id UUID,
  p_from DATE,
  p_to DATE,
  p_outcome TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  date_of_birth DATE,
  sex TEXT,
  ward TEXT,
  bed_label TEXT,
  admission_type TEXT,
  chief_complaint TEXT,
  weight_kg NUMERIC,
  admitted_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  discharged_at TIMESTAMPTZ,
  outcome TEXT,
  disposition TEXT,
  discharge_notes TEXT,
  status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    a.id,
    a.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name) AS patient_name,
    p.date_of_birth,
    p.sex,
    a.ward,
    a.bed_label,
    a.admission_type,
    a.chief_complaint,
    a.weight_kg,
    a.admitted_at,
    (SELECT MAX(o.observed_at) FROM admission_observations o WHERE o.admission_id = a.id) AS last_observed_at,
    a.discharged_at,
    a.outcome,
    a.disposition,
    a.discharge_notes,
    a.status
  FROM admissions a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.clinic_id = p_clinic_id
    AND a.status IN ('discharged', 'transferred')
    AND a.discharged_at IS NOT NULL
    AND a.discharged_at::date BETWEEN p_from AND p_to
    AND (p_outcome IS NULL OR a.outcome = p_outcome)
  ORDER BY a.discharged_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_discharged_admissions(UUID, DATE, DATE, TEXT) TO anon, authenticated;

COMMIT;
