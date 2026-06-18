-- 065_finalized_data.sql
--
-- F3 — one definition of "finalized" clinical data, shared by reports, the
-- HMIS finalize-by-clinician list, and the Data overview unfinalized count.
--
-- Rule (locked, docs/ehr-ui-rework-plan.md §4 F3):
--   * Demographics (sex, geography, age) are always usable — no confirmation.
--   * Clinical fields (diagnosis, medications, plan) only count once the note
--     is SIGNED, i.e. the visit reached status 'sent' or 'completed'.
--
-- This matches what generate_hmis_105 already filters on (migration 062); we
-- lift it into a reusable function so every report uses the same gate.

CREATE OR REPLACE FUNCTION is_visit_finalized(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_status IN ('sent', 'completed')
$$;

COMMENT ON FUNCTION is_visit_finalized(TEXT) IS
  'True when a visit''s clinical data is finalized (note signed: status sent|completed). Reports must filter on this.';

-- Per-clinician list of visits in a period whose clinical data is NOT yet
-- finalized. Drives:
--   * HMIS 105 "finalize before counting" worklist, grouped by the clinician
--     who saw the patient (#11),
--   * the Data overview "N visits unfinalized" indicator (#10).
-- One row per unfinalized visit; callers group by doctor_id.
CREATE OR REPLACE FUNCTION rpc_unfinalized_visits(
  p_clinic_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_number BIGINT,
  visit_date DATE,
  doctor_id UUID,
  doctor_name TEXT,
  status TEXT,
  has_diagnosis BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id,
    v.patient_id,
    COALESCE(p.display_name, NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')),
    p.patient_id,
    v.visit_date,
    v.doctor_id,
    s.display_name,
    v.status,
    (v.diagnosis IS NOT NULL AND TRIM(v.diagnosis) <> '')
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff s ON s.id = v.doctor_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date BETWEEN p_from AND p_to
    AND NOT is_visit_finalized(v.status)
    AND v.status <> 'error'
  ORDER BY s.display_name NULLS LAST, v.visit_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION is_visit_finalized(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_unfinalized_visits(UUID, DATE, DATE) TO authenticated, service_role;
