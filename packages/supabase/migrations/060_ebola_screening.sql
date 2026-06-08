-- 060_ebola_screening.sql
--
-- Ebola / VHF screening record (docs/maternal-neonatal-research.md sibling: the
-- outbreak feature, migration 052). When a clinic's region is ON the ebola
-- protocol, febrile patients are screened against the Uganda MOH / WHO VHF
-- suspect-case definition; a suspect case is a real, auditable record (it drives
-- isolation + district notification + referral), not a dismissable popup.
--
-- The on-device rule (OutbreakScreeningRules) decides is_suspect; this table
-- records the screen. Offline-first: outbox -> SECURITY DEFINER RPC, idempotent.

CREATE TABLE IF NOT EXISTS ebola_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID,
  temp_c NUMERIC,
  epi_contact BOOLEAN NOT NULL DEFAULT FALSE,        -- contact/funeral/animal exposure
  unexplained_bleeding BOOLEAN NOT NULL DEFAULT FALSE,
  symptoms TEXT,                                      -- comma-joined symptom slugs
  is_suspect BOOLEAN NOT NULL DEFAULT FALSE,
  action_taken TEXT,                                  -- e.g. isolated / notified / referred
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ebola_screenings_visit ON ebola_screenings(visit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ebola_screenings_clinic_suspect
  ON ebola_screenings(clinic_id, is_suspect, created_at DESC);

CREATE OR REPLACE FUNCTION rpc_record_ebola_screening(
  p_id UUID,
  p_patient_id UUID,
  p_visit_id UUID DEFAULT NULL,
  p_temp_c NUMERIC DEFAULT NULL,
  p_epi_contact BOOLEAN DEFAULT FALSE,
  p_unexplained_bleeding BOOLEAN DEFAULT FALSE,
  p_symptoms TEXT DEFAULT NULL,
  p_is_suspect BOOLEAN DEFAULT FALSE,
  p_action_taken TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO ebola_screenings (
    id, clinic_id, patient_id, visit_id, temp_c, epi_contact, unexplained_bleeding,
    symptoms, is_suspect, action_taken, recorded_by
  )
  VALUES (
    p_id, v_clinic_id, p_patient_id, p_visit_id, p_temp_c, p_epi_contact, p_unexplained_bleeding,
    p_symptoms, p_is_suspect, p_action_taken, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    temp_c = EXCLUDED.temp_c, epi_contact = EXCLUDED.epi_contact,
    unexplained_bleeding = EXCLUDED.unexplained_bleeding, symptoms = EXCLUDED.symptoms,
    is_suspect = EXCLUDED.is_suspect, action_taken = EXCLUDED.action_taken;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_ebola_screening', 'ebola_screenings', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_ebola_screening(
  UUID, UUID, UUID, NUMERIC, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- Latest screening for a visit (so the banner persists across reopens).
CREATE OR REPLACE FUNCTION rpc_visit_ebola_screening(p_visit_id UUID)
RETURNS SETOF ebola_screenings
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM ebola_screenings WHERE visit_id = p_visit_id ORDER BY created_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION rpc_visit_ebola_screening(UUID) TO anon, authenticated;
