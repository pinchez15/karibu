-- 085_purge_rpc_sql_editor_auth.sql
--
-- The Supabase SQL editor does not always attach a Clerk JWT, so is_superadmin()
-- alone fails even for platform owners. Allow the same trusted sessions as
-- karibu_is_service_role() (direct postgres / service_role) plus dashboard roles.

CREATE OR REPLACE FUNCTION rpc_admin_purge_clinical_data_before(
  p_cutoff_date DATE,
  p_clinic_id UUID DEFAULT NULL,
  p_delete_orphan_patients BOOLEAN DEFAULT TRUE,
  p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_count INTEGER := 0;
  v_patient_count INTEGER := 0;
  v_payments INTEGER := 0;
  v_charges INTEGER := 0;
  v_notes INTEGER := 0;
  v_admissions INTEGER := 0;
  v_pregnancies INTEGER := 0;
  v_appointments INTEGER := 0;
  v_misc INTEGER := 0;
BEGIN
  IF p_cutoff_date IS NULL THEN
    RAISE EXCEPTION 'p_cutoff_date is required';
  END IF;

  IF NOT (
    is_superadmin()
    OR karibu_is_service_role()
    OR current_user IN ('postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION
      'Only platform superadmins or trusted database sessions may purge clinical data (jwt sub=%, user=%)',
      COALESCE(auth.jwt()->>'sub', '<none>'),
      current_user;
  END IF;

  CREATE TEMP TABLE _purge_visits (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    clinic_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _purge_visits (id, patient_id, clinic_id)
  SELECT v.id, v.patient_id, v.clinic_id
  FROM visits v
  WHERE COALESCE(v.visit_date, (v.created_at AT TIME ZONE 'UTC')::date) < p_cutoff_date
    AND (p_clinic_id IS NULL OR v.clinic_id = p_clinic_id);

  GET DIAGNOSTICS v_visit_count = ROW_COUNT;

  CREATE TEMP TABLE _purge_patients (id UUID PRIMARY KEY) ON COMMIT DROP;

  IF p_delete_orphan_patients THEN
    INSERT INTO _purge_patients (id)
    SELECT p.id
    FROM patients p
    WHERE (p_clinic_id IS NULL OR p.clinic_id = p_clinic_id)
      AND EXISTS (SELECT 1 FROM visits v WHERE v.patient_id = p.id)
      AND NOT EXISTS (
        SELECT 1
        FROM visits v
        WHERE v.patient_id = p.id
          AND COALESCE(v.visit_date, (v.created_at AT TIME ZONE 'UTC')::date) >= p_cutoff_date
      );

    GET DIAGNOSTICS v_patient_count = ROW_COUNT;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_payments
  FROM payments pm
  WHERE pm.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pm.patient_id IN (SELECT id FROM _purge_patients));

  SELECT COUNT(*)::INTEGER INTO v_charges
  FROM charges c
  WHERE c.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND c.patient_id IN (SELECT id FROM _purge_patients));

  SELECT COUNT(*)::INTEGER INTO v_notes
  FROM provider_notes pn
  WHERE pn.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pn.patient_id IN (SELECT id FROM _purge_patients));

  SELECT COUNT(*)::INTEGER INTO v_admissions
  FROM admissions a
  WHERE p_delete_orphan_patients AND a.patient_id IN (SELECT id FROM _purge_patients);

  SELECT COUNT(*)::INTEGER INTO v_pregnancies
  FROM pregnancies pg
  WHERE p_delete_orphan_patients AND pg.patient_id IN (SELECT id FROM _purge_patients);

  SELECT COUNT(*)::INTEGER INTO v_appointments
  FROM appointments ap
  WHERE (ap.patient_id IN (SELECT id FROM _purge_patients) AND p_delete_orphan_patients)
     OR (
       ap.patient_id IN (SELECT DISTINCT patient_id FROM _purge_visits)
       AND ap.scheduled_at::date < p_cutoff_date
     );

  SELECT
    COALESCE((
      SELECT COUNT(*)::INTEGER FROM care_tasks ct
      WHERE (p_delete_orphan_patients AND ct.patient_id IN (SELECT id FROM _purge_patients))
         OR ct.visit_id IN (SELECT id FROM _purge_visits)
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM patient_vitals pv
      WHERE (p_delete_orphan_patients AND pv.patient_id IN (SELECT id FROM _purge_patients))
         OR pv.visit_id IN (SELECT id FROM _purge_visits)
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM ebola_screenings es
      WHERE p_delete_orphan_patients AND es.patient_id IN (SELECT id FROM _purge_patients)
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM referrals r
      WHERE (p_delete_orphan_patients AND r.patient_id IN (SELECT id FROM _purge_patients))
         OR r.visit_id IN (SELECT id FROM _purge_visits)
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM protocol_activations pa
      WHERE (p_delete_orphan_patients AND pa.patient_id IN (SELECT id FROM _purge_patients))
         OR pa.visit_id IN (SELECT id FROM _purge_visits)
    ), 0)
  INTO v_misc;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', TRUE,
      'cutoff_date', p_cutoff_date,
      'clinic_id', p_clinic_id,
      'visits', v_visit_count,
      'orphan_patients', v_patient_count,
      'payments', v_payments,
      'charges', v_charges,
      'provider_notes', v_notes,
      'admissions', v_admissions,
      'pregnancies', v_pregnancies,
      'appointments', v_appointments,
      'other_patient_visit_rows', v_misc
    );
  END IF;

  DELETE FROM payments pm
  WHERE pm.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pm.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM charges c
  WHERE c.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND c.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM care_tasks ct
  WHERE ct.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND ct.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM patient_vitals pv
  WHERE pv.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pv.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM referrals r
  WHERE r.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND r.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM protocol_activations pa
  WHERE pa.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pa.patient_id IN (SELECT id FROM _purge_patients));

  DELETE FROM appointments ap
  WHERE (p_delete_orphan_patients AND ap.patient_id IN (SELECT id FROM _purge_patients))
     OR (
       ap.patient_id IN (SELECT DISTINCT patient_id FROM _purge_visits)
       AND ap.scheduled_at::date < p_cutoff_date
     );

  DELETE FROM provider_notes pn
  WHERE pn.visit_id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND pn.patient_id IN (SELECT id FROM _purge_patients));

  UPDATE visits v
  SET admission_id = NULL
  WHERE v.id IN (SELECT id FROM _purge_visits);

  DELETE FROM visits v
  WHERE v.id IN (SELECT id FROM _purge_visits)
     OR (p_delete_orphan_patients AND v.patient_id IN (SELECT id FROM _purge_patients));

  IF p_delete_orphan_patients THEN
    DELETE FROM ebola_screenings es
    WHERE es.patient_id IN (SELECT id FROM _purge_patients);

    DELETE FROM pregnancies pg
    WHERE pg.patient_id IN (SELECT id FROM _purge_patients);

    DELETE FROM admissions a
    WHERE a.patient_id IN (SELECT id FROM _purge_patients);

    DELETE FROM patients p
    WHERE p.id IN (SELECT id FROM _purge_patients);
  END IF;

  RETURN jsonb_build_object(
    'dry_run', FALSE,
    'cutoff_date', p_cutoff_date,
    'clinic_id', p_clinic_id,
    'visits_removed', v_visit_count,
    'patients_removed', v_patient_count,
    'payments_removed', v_payments,
    'charges_removed', v_charges,
    'provider_notes_removed', v_notes,
    'admissions_removed', v_admissions,
    'pregnancies_removed', v_pregnancies,
    'appointments_removed', v_appointments,
    'other_rows_removed', v_misc
  );
END;
$$;

REVOKE ALL ON FUNCTION rpc_admin_purge_clinical_data_before(DATE, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_admin_purge_clinical_data_before(DATE, UUID, BOOLEAN, BOOLEAN)
  TO authenticated, service_role;
