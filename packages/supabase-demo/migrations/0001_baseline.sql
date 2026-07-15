-- Consolidated schema baseline: end state of packages/supabase/migrations
-- 001-105 (minus demo seeds 004/012/014), built 2026-07-14 on a local
-- shadow Postgres. Regenerate with scripts/build-baseline-local.sh.

-- Platform-preinstalled extensions (no-ops on a real Supabase project):
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
-- Migration-added extensions, in public exactly as on prod (033/038/066):
CREATE EXTENSION IF NOT EXISTS vector        WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm       WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10 (Homebrew)
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: acquire_audio_processing_lock(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acquire_audio_processing_lock(p_visit_id uuid, p_lock_id uuid, p_lock_timeout_seconds integer DEFAULT 300) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  -- Try to acquire lock only if:
  -- 1. No current lock exists, OR
  -- 2. Lock has expired (older than timeout)
  UPDATE audio_uploads
  SET
    processing_lock = p_lock_id,
    locked_at = NOW()
  WHERE visit_id = p_visit_id
    AND (
      processing_lock IS NULL
      OR locked_at < NOW() - (p_lock_timeout_seconds || ' seconds')::INTERVAL
    )
  RETURNING TRUE INTO v_locked;

  RETURN COALESCE(v_locked, FALSE);
END;
$$;


--
-- Name: aggregate_visit_dispensing_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aggregate_visit_dispensing_status(p_visit_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_total INT;
  v_dispensed INT;
  v_partial INT;
  v_oos INT;
  v_needs_clar INT;
  v_open INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'dispensed'),
    COUNT(*) FILTER (WHERE status = 'partially_dispensed'),
    COUNT(*) FILTER (WHERE status = 'out_of_stock'),
    COUNT(*) FILTER (WHERE status = 'needs_clarification'),
    COUNT(*) FILTER (WHERE status IN ('ordered', 'dispensing'))
  INTO v_total, v_dispensed, v_partial, v_oos, v_needs_clar, v_open
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  IF v_total = 0 THEN
    RETURN 'not_started';
  END IF;

  IF v_dispensed = v_total THEN
    RETURN 'dispensed';
  END IF;

  IF v_oos = v_total THEN
    RETURN 'out_of_stock';
  END IF;

  -- Clinician must act: ≥1 line needs clarification and nothing in-flight at pharmacy.
  IF v_needs_clar > 0 AND v_open = 0 THEN
    RETURN 'returned';
  END IF;

  IF v_dispensed > 0 OR v_partial > 0 OR v_oos > 0 THEN
    RETURN 'partial';
  END IF;

  IF v_open > 0 OR v_needs_clar > 0 THEN
    RETURN 'in_progress';
  END IF;

  RETURN 'in_progress';
END;
$$;


--
-- Name: apply_lab_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_lab_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE lab_stock_items
     SET quantity_on_hand = quantity_on_hand + NEW.quantity_delta
   WHERE id = NEW.stock_item_id;
  RETURN NEW;
END;
$$;


--
-- Name: apply_pharmacy_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_pharmacy_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE pharmacy_stock_batches
    SET quantity_on_hand = GREATEST(0, quantity_on_hand + NEW.quantity_delta)
    WHERE id = NEW.batch_id
      AND stock_item_id = NEW.stock_item_id;

    PERFORM recompute_pharmacy_stock_item_quantity(NEW.stock_item_id);
  ELSE
    -- Legacy / Android aggregate decrement — no batch row touched.
    UPDATE pharmacy_stock_items
    SET quantity_on_hand = GREATEST(0, quantity_on_hand + NEW.quantity_delta)
    WHERE id = NEW.stock_item_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: assert_onboarding_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_onboarding_complete() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM staff
    WHERE id = v_staff_id
      AND onboarding_completed_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'ONBOARDING_REQUIRED'
    USING HINT = 'Complete KaribuEHR onboarding before registering patients.';
END;
$$;


--
-- Name: assert_staff_in_clinic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_staff_in_clinic(p_clinic_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id required';
  END IF;

  IF karibu_is_service_role() THEN
    RETURN;  -- web server actions / edge functions pre-scope by clinic
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE clinic_id = p_clinic_id
      AND clerk_user_id = v_clerk_user_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Staff not authorized for this clinic';
  END IF;
END;
$$;


--
-- Name: assign_patient_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_patient_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN
    NEW.patient_id := nextval('patient_id_seq');
  END IF;

  NEW.patient_number := NEW.patient_id::text;
  RETURN NEW;
END;
$$;


--
-- Name: assign_to_nurse(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_to_nurse(p_visit_id uuid, p_nurse_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_nurse_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'nursing_assistant', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized to triage at this clinic';
  END IF;

  UPDATE visits
  SET
    nurse_id = p_nurse_id,
    queue_status = 'with_nurse'
  WHERE id = p_visit_id
    AND queue_status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in waiting status';
  END IF;
END;
$$;


--
-- Name: kampala_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kampala_today() RETURNS date
    LANGUAGE sql STABLE
    AS $$
  SELECT (NOW() AT TIME ZONE 'Africa/Kampala')::DATE;
$$;


--
-- Name: assign_today_number(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_today_number(p_clinic_id uuid, p_visit_date date DEFAULT public.kampala_today()) RETURNS integer
    LANGUAGE sql
    AS $$
  SELECT COALESCE(MAX(queue_position), 0) + 1
  FROM visits
  WHERE clinic_id = p_clinic_id
    AND visit_date = p_visit_date;
$$;


--
-- Name: billing_charge_lab_test(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_charge_lab_test(p_visit_id uuid, p_test_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visit RECORD;
  v_price INTEGER;
  v_trimmed TEXT;
BEGIN
  v_trimmed := NULLIF(TRIM(p_test_name), '');
  IF v_trimmed IS NULL THEN RETURN; END IF;

  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'lab'
      AND description = v_trimmed AND NOT voided
  ) THEN RETURN; END IF;

  v_price := billing_lab_test_price(v_visit.clinic_id, v_trimmed);

  INSERT INTO charges (
    clinic_id, patient_id, visit_id, description, category, amount_ugx,
    quantity, unit_price_ugx, source, created_by
  ) VALUES (
    v_visit.clinic_id, v_visit.patient_id, p_visit_id,
    v_trimmed, 'lab', v_price,
    1, v_price, 'lab', get_current_staff_id()
  );
END;
$$;


--
-- Name: billing_charge_pharmacy_line(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_charge_pharmacy_line(p_visit_id uuid, p_prescription_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visit RECORD;
  v_po RECORD;
  v_qty NUMERIC;
  v_unit_price INTEGER;
  v_total INTEGER;
  v_name TEXT;
  v_item_code TEXT;
  v_desc TEXT;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_po FROM prescription_orders
  WHERE id = p_prescription_order_id AND visit_id = p_visit_id;
  IF v_po.id IS NULL THEN RETURN; END IF;

  IF v_po.status NOT IN ('dispensed', 'partially_dispensed') THEN RETURN; END IF;

  SELECT COALESCE(SUM(quantity_dispensed), 0) INTO v_qty
  FROM dispense_records
  WHERE prescription_order_id = p_prescription_order_id
    AND line_status IN ('dispensed', 'partially_dispensed');

  IF v_qty <= 0 THEN RETURN; END IF;

  -- D3: identity is the prescription order id, so two lines of the same drug
  -- never collapse into a single charge.
  v_item_code := v_po.id::text;
  v_unit_price := billing_pharmacy_unit_price(v_visit.clinic_id, v_po.medication_code);
  v_total := ROUND(v_unit_price * v_qty)::INTEGER;
  v_name := COALESCE(
    (SELECT generic_name FROM medication_catalog WHERE code = v_po.medication_code),
    v_po.free_text_name,
    'Medication'
  );
  v_desc := v_name || COALESCE(' × ' || v_qty::text || ' ' || COALESCE(v_po.quantity_unit, ''), '');

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided
  ) THEN
    -- D4: never overwrite a manually corrected amount. The UPDATE is a no-op when
    -- manually_adjusted is TRUE, leaving the pharmacist's correction intact.
    UPDATE charges
    SET quantity = v_qty,
        unit_price_ugx = v_unit_price,
        amount_ugx = v_total,
        description = v_desc
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided
      AND NOT manually_adjusted;
  ELSE
    INSERT INTO charges (
      clinic_id, patient_id, visit_id, description, category, amount_ugx,
      quantity, unit_price_ugx, item_code, source, created_by
    ) VALUES (
      v_visit.clinic_id, v_visit.patient_id, p_visit_id,
      v_desc, 'pharmacy', v_total,
      v_qty, v_unit_price, v_item_code, 'pharmacy', get_current_staff_id()
    );
  END IF;
END;
$$;


--
-- Name: billing_ensure_consultation_charge(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_ensure_consultation_charge(p_visit_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visit RECORD;
  v_fee INTEGER;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'consultation' AND NOT voided
  ) THEN RETURN; END IF;

  SELECT consultation_fee_ugx INTO v_fee
  FROM clinic_billing_rates WHERE clinic_id = v_visit.clinic_id;
  v_fee := COALESCE(v_fee, 5000);

  INSERT INTO charges (
    clinic_id, patient_id, visit_id, description, category, amount_ugx,
    quantity, unit_price_ugx, source, created_by
  ) VALUES (
    v_visit.clinic_id, v_visit.patient_id, p_visit_id,
    'OPD consultation', 'consultation', v_fee,
    1, v_fee, 'consultation', get_current_staff_id()
  );
END;
$$;


--
-- Name: billing_lab_test_price(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_lab_test_price(p_clinic_id uuid, p_test_name text) RETURNS integer
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_price INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT lsi.unit_price_ugx FROM lab_stock_items lsi
     WHERE lsi.clinic_id = p_clinic_id
       AND lsi.active
       AND lsi.unit_price_ugx IS NOT NULL
       AND (
         LOWER(lsi.test_name) = LOWER(p_test_name)
         OR LOWER(COALESCE(lsi.test_code, '')) = LOWER(p_test_name)
       )
     ORDER BY lsi.updated_at DESC
     LIMIT 1),
    (SELECT l.default_price_ugx FROM lab_test_catalog l
     WHERE LOWER(l.test_name) = LOWER(p_test_name)
        OR LOWER(l.code) = LOWER(p_test_name)
     LIMIT 1),
    2000
  ) INTO v_price;

  RETURN COALESCE(v_price, 2000);
END;
$$;


--
-- Name: billing_pharmacy_unit_price(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_pharmacy_unit_price(p_clinic_id uuid, p_medication_code text) RETURNS integer
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cost INTEGER;
  v_markup INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT psi.unit_price_ugx FROM pharmacy_stock_items psi
     WHERE psi.clinic_id = p_clinic_id
       AND psi.drug_code = p_medication_code
       AND psi.active
       AND psi.unit_price_ugx IS NOT NULL
     ORDER BY psi.updated_at DESC LIMIT 1),
    (SELECT mc.default_price_ugx FROM medication_catalog mc WHERE mc.code = p_medication_code),
    200
  ) INTO v_cost;

  v_cost := COALESCE(v_cost, 200);

  SELECT COALESCE(pharmacy_markup_percent, 10) INTO v_markup
  FROM clinic_billing_rates
  WHERE clinic_id = p_clinic_id;

  v_markup := COALESCE(v_markup, 10);

  RETURN ROUND(v_cost * (1 + v_markup / 100.0))::INTEGER;
END;
$$;


--
-- Name: cancel_visit_queue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_visit_queue(p_visit_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE visits
  SET queue_status = 'cancelled'
  WHERE id = p_visit_id
    AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor');
END;
$$;


--
-- Name: cancel_visit_queue(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_visit_queue(p_visit_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_visit RECORD;
BEGIN
  -- Get visit info
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify staff belongs to clinic if provided
  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = v_visit.clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'cancelled'
  WHERE id = p_visit_id
    AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit cannot be cancelled from current status';
  END IF;
END;
$$;


--
-- Name: check_in_patient(uuid, uuid, text, text, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_patient(p_clinic_id uuid, p_patient_id uuid, p_chief_complaint text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_staff_id uuid DEFAULT NULL::uuid, p_department text DEFAULT 'opd'::text, p_visit_id uuid DEFAULT NULL::uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_client_op_id IS NOT NULL AND sync_op_already_applied(p_client_op_id) THEN
    RETURN (SELECT entity_id FROM sync_operations WHERE id = p_client_op_id);
  END IF;

  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  v_visit_id := COALESCE(p_visit_id, gen_random_uuid());
  v_queue_position := assign_today_number(p_clinic_id, kampala_today());

  INSERT INTO visits (
    id,
    clinic_id,
    patient_id,
    status,
    queue_status,
    queue_position,
    checked_in_at,
    chief_complaint,
    priority,
    visit_date,
    department
  ) VALUES (
    v_visit_id,
    p_clinic_id,
    p_patient_id,
    'pending',
    'waiting',
    v_queue_position,
    NOW(),
    p_chief_complaint,
    p_priority,
    kampala_today(),
    p_department
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, p_clinic_id, 'check_in_patient', 'visits', v_visit_id
    );
  END IF;

  RETURN v_visit_id;
END;
$$;


--
-- Name: claim_patient(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_patient(p_visit_id uuid, p_doctor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_doctor_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as lead clinician for this clinic';
  END IF;

  UPDATE visits
  SET
    doctor_id = p_doctor_id,
    queue_status = 'with_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'ready_for_doctor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in ready_for_doctor status';
  END IF;
END;
$$;


--
-- Name: clear_visit_error(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_visit_error(p_visit_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE visits
  SET
    error_message = NULL,
    error_at = NULL,
    status = 'processing'
  WHERE id = p_visit_id
    AND status = 'error';
END;
$$;


--
-- Name: complete_transcription(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_transcription(p_visit_id uuid, p_transcript text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Update audio upload status
  UPDATE audio_uploads
  SET status = 'completed',
      transcription_completed_at = NOW()
  WHERE visit_id = p_visit_id;

  -- Insert or update provider note with transcript
  INSERT INTO provider_notes (visit_id, transcript, status)
  VALUES (p_visit_id, p_transcript, 'draft')
  ON CONFLICT (visit_id)
  DO UPDATE SET transcript = p_transcript, updated_at = NOW();
END;
$$;


--
-- Name: complete_visit_queue(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_visit_queue(p_visit_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_visit RECORD;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  IF p_staff_id IS NOT NULL THEN
    IF v_visit.doctor_id IS DISTINCT FROM p_staff_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant','records_officer')
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned clinician, records officer, or admin can complete visit';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'completed',
      status = 'completed',
      finalized_at = COALESCE(finalized_at, NOW()),
      updated_at = NOW()
  WHERE id = p_visit_id
    AND queue_status != 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit cannot be completed from cancelled queue status';
  END IF;
END;
$$;


--
-- Name: count_unanswered_ai_notes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_unanswered_ai_notes(p_visit_id uuid) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::INTEGER
  FROM ai_review_suggestions
  WHERE visit_id = p_visit_id
    AND clinician_response IS NULL
    AND display_tier = 'timeline';
$$;


--
-- Name: derive_visit_lab_state(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_visit_lab_state(p_results jsonb) RETURNS TABLE(lab_status text, lab_results text, lab_abnormal boolean, all_complete boolean)
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_total INT;
  v_done INT;
  v_abnormal_count INT;
  v_any_running BOOLEAN;
  v_summary TEXT;
BEGIN
  v_total := jsonb_array_length(COALESCE(p_results, '[]'::jsonb));
  IF v_total = 0 THEN
    RETURN QUERY SELECT 'not_ordered'::TEXT, NULL::TEXT, FALSE, TRUE;
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE elem->>'status' IN ('done', 'abnormal')),
    COUNT(*) FILTER (WHERE (elem->>'abnormal')::boolean IS TRUE),
    BOOL_OR(elem->>'status' = 'running')
  INTO v_done, v_abnormal_count, v_any_running
  FROM jsonb_array_elements(p_results) AS elem;

  SELECT string_agg(
    (elem->>'test') || ': ' || COALESCE(elem->>'result', '—'),
    '; ' ORDER BY elem->>'test'
  )
  INTO v_summary
  FROM jsonb_array_elements(p_results) AS elem
  WHERE elem->>'status' IN ('done', 'abnormal');

  all_complete := v_done = v_total;

  IF v_done = 0 AND NOT v_any_running THEN
    lab_status := 'pending';
  ELSIF v_done < v_total THEN
    lab_status := 'running';
  ELSIF v_abnormal_count > 0 THEN
    lab_status := 'abnormal';
  ELSE
    lab_status := 'done';
  END IF;

  lab_abnormal := v_abnormal_count > 0;
  lab_results := NULLIF(TRIM(v_summary), '');
  RETURN NEXT;
END;
$$;


--
-- Name: format_prescription_line_summary(text, text, text, text, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.format_prescription_line_summary(p_medication_code text, p_free_text_name text, p_dose_text text, p_route_text text, p_frequency_text text, p_duration_text text, p_quantity_prescribed numeric, p_quantity_unit text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_name TEXT;
  v_parts TEXT[];
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(p_free_text_name), ''),
    (SELECT generic_name FROM medication_catalog WHERE code = p_medication_code)
  );
  IF v_name IS NULL THEN
    v_name := COALESCE(p_medication_code, 'Medication');
  END IF;

  v_parts := ARRAY[v_name];
  IF NULLIF(TRIM(p_dose_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_dose_text);
  END IF;
  IF p_quantity_prescribed IS NOT NULL AND NULLIF(TRIM(p_quantity_unit), '') IS NOT NULL THEN
    v_parts := v_parts || (TRIM(to_char(p_quantity_prescribed, 'FM999990.##')) || ' ' || TRIM(p_quantity_unit));
  END IF;
  IF NULLIF(TRIM(p_route_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_route_text);
  END IF;
  IF NULLIF(TRIM(p_frequency_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_frequency_text);
  END IF;
  IF NULLIF(TRIM(p_duration_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_duration_text);
  END IF;

  RETURN array_to_string(v_parts, ' ');
END;
$$;


--
-- Name: generate_hmis_105(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_hmis_105(p_clinic_id uuid, p_year integer, p_month integer) RETURNS TABLE(hmis_code text, display_name text, sort_order integer, male_0_28d bigint, female_0_28d bigint, male_29d_4y bigint, female_29d_4y bigint, male_5_14y bigint, female_5_14y bigint, male_15_59y bigint, female_15_59y bigint, male_60plus bigint, female_60plus bigint, total bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  period_start DATE;
  period_end DATE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  period_start := make_date(p_year, p_month, 1);
  period_end := (period_start + INTERVAL '1 month')::DATE;

  RETURN QUERY
  SELECT
    h.hmis_code,
    h.display_name,
    h.sort_order,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days IS NOT NULL AND age_days >= 0 AND age_days <= 28)::BIGINT AS male_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days IS NOT NULL AND age_days >= 0 AND age_days <= 28)::BIGINT AS female_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND (age_days IS NULL OR age_days > 28) AND age_years < 5)::BIGINT AS male_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND (age_days IS NULL OR age_days > 28) AND age_years < 5)::BIGINT AS female_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 5 AND age_years <= 14)::BIGINT AS male_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 5 AND age_years <= 14)::BIGINT AS female_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 15 AND age_years <= 59)::BIGINT AS male_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 15 AND age_years <= 59)::BIGINT AS female_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 60)::BIGINT AS male_60plus,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 60)::BIGINT AS female_60plus,
    COUNT(p.hmis_code_id)::BIGINT AS total
  FROM hmis_diagnosis_codes h
  LEFT JOIN (
    SELECT
      vdc.hmis_code_id,
      pat.sex,
      CASE
        WHEN pat.dob_precision = 'exact' AND pat.date_of_birth IS NOT NULL
        THEN (v.visit_date::DATE - pat.date_of_birth::DATE)
        ELSE NULL
      END AS age_days,
      CASE
        WHEN pat.dob_precision = 'exact' AND pat.date_of_birth IS NOT NULL
          THEN EXTRACT(YEAR FROM age(v.visit_date::DATE, pat.date_of_birth::DATE))::INT
        WHEN pat.dob_precision = 'year_only' AND pat.birth_year IS NOT NULL
          THEN EXTRACT(YEAR FROM v.visit_date::DATE)::INT - pat.birth_year::INT
        WHEN pat.dob_precision = 'age_estimate' AND pat.approximate_age IS NOT NULL AND pat.age_recorded_at IS NOT NULL
          THEN pat.approximate_age::INT
            + (EXTRACT(YEAR FROM v.visit_date::DATE)::INT - EXTRACT(YEAR FROM pat.age_recorded_at::DATE)::INT)
        ELSE NULL
      END AS age_years
    FROM visit_diagnosis_codes vdc
    JOIN visits v ON v.id = vdc.visit_id
    JOIN patients pat ON pat.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date >= period_start
      AND v.visit_date < period_end
      AND v.status IN ('sent', 'completed')
      AND v.department = 'opd'
      AND vdc.source IN ('manual', 'ai_confirmed')
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;


--
-- Name: generate_hmis_106a_hiv(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_hmis_106a_hiv(p_clinic_id uuid, p_fy_start_year integer, p_quarter integer) RETURNS TABLE(element_code text, section text, display_name text, sort_order integer, male_under_2 bigint, female_under_2 bigint, male_2_4 bigint, female_2_4 bigint, male_5_14 bigint, female_5_14 bigint, male_15_49 bigint, female_15_49 bigint, male_50_plus bigint, female_50_plus bigint, total bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  SELECT period_start, period_end INTO v_start, v_end
  FROM uganda_fy_quarter_bounds(p_fy_start_year, p_quarter);

  RETURN QUERY
  WITH base AS (
    SELECT e.element_code, e.section, e.display_name, e.sort_order
    FROM hmis_106a_elements e
    WHERE e.report = 'hiv' AND e.is_active
  ),
  hts AS (
    SELECT
      h.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(h.patient_id, h.event_date)) AS age_band
    FROM hts_events h
    JOIN patients pat ON pat.id = h.patient_id
    WHERE h.clinic_id = p_clinic_id
      AND h.event_date >= v_start AND h.event_date < v_end
  ),
  hts_counts AS (
    SELECT 'HIV_HCT_COUNSELED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM hts WHERE counseled GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_TESTED', sex, age_band, COUNT(*) FROM hts WHERE tested GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_RESULT_RECEIVED', sex, age_band, COUNT(*) FROM hts WHERE result_received GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_FIRST_RESULT_FY', sex, age_band, COUNT(*) FROM hts WHERE first_result_in_fy GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_POSITIVE', sex, age_band, COUNT(*) FROM hts WHERE result = 'positive' GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_SUSPECT_TB', sex, age_band, COUNT(*) FROM hts WHERE result = 'positive' AND suspected_tb GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_STARTED_CPT', sex, age_band, COUNT(*) FROM hts WHERE started_cpt GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_RETESTER', sex, age_band, COUNT(*) FROM hts WHERE retester GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_TESTED', sex, age_band, COUNT(*) FROM hts WHERE couple_test GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_CONCORDANT', sex, age_band, COUNT(*) FROM hts WHERE couple_concordant IS TRUE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_DISCORDANT', sex, age_band, COUNT(*) FROM hts WHERE couple_concordant IS FALSE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_PEP', sex, age_band, COUNT(*) FROM hts WHERE pep GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_SMC', sex, age_band, COUNT(*) FROM hts WHERE smc_provided GROUP BY sex, age_band
  ),
  care AS (
    SELECT
      c.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(c.patient_id, c.enrolled_at)) AS age_band
    FROM hiv_care_enrollments c
    JOIN patients pat ON pat.id = c.patient_id
    WHERE c.clinic_id = p_clinic_id
  ),
  care_counts AS (
    SELECT 'HIV_ART_NEW_ENROLLED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM care WHERE enrolled_at >= v_start AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_NEW_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE art_start_date >= v_start AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_PREGNANT_ENROLLED', sex, age_band, COUNT(*)
    FROM care WHERE pregnant_at_enrollment AND enrolled_at >= v_start AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_PREGNANT_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE pregnant_at_enrollment AND art_start_date >= v_start AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ACTIVE_PREART', sex, age_band, COUNT(*)
    FROM care WHERE care_status = 'pre_art' AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_CPT_LAST_VISIT', sex, age_band, COUNT(*)
    FROM care WHERE cpt_at_last_visit AND care_status IN ('pre_art', 'on_art') AND updated_at::DATE < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ELIGIBLE_NOT_ART', sex, age_band, COUNT(*)
    FROM care WHERE eligible_not_on_art AND care_status = 'pre_art' GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ACTIVE_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE care_status = 'on_art' AND art_start_date IS NOT NULL AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_TB_SCREENED', sex, age_band, COUNT(*)
    FROM care WHERE tb_assessed_last_visit AND care_status IN ('pre_art', 'on_art') GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_TB_TREATMENT', sex, age_band, COUNT(*)
    FROM care WHERE tb_treatment_started AND updated_at::DATE >= v_start AND updated_at::DATE < v_end GROUP BY sex, age_band
  ),
  vl AS (
    SELECT v.*, pat.sex, hiv_hmis_age_band(patient_age_years_at(v.patient_id, v.test_date)) AS age_band
    FROM viral_load_tests v
    JOIN patients pat ON pat.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id AND v.test_date >= v_start AND v.test_date < v_end
  ),
  vl_counts AS (
    SELECT 'HIV_VL_TESTED' AS code, sex, age_band, COUNT(*)::BIGINT AS n FROM vl GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_VL_SUPPRESSED', sex, age_band, COUNT(*) FROM vl WHERE suppressed IS TRUE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_VL_NOT_SUPPRESSED', sex, age_band, COUNT(*) FROM vl WHERE suppressed IS FALSE GROUP BY sex, age_band
  ),
  all_counts AS (
    SELECT * FROM hts_counts
    UNION ALL SELECT * FROM care_counts
    UNION ALL SELECT * FROM vl_counts
  )
  SELECT
    b.element_code,
    b.section,
    b.display_name,
    b.sort_order,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n), 0)::BIGINT
  FROM base b
  LEFT JOIN all_counts ac ON ac.code = b.element_code
  GROUP BY b.element_code, b.section, b.display_name, b.sort_order
  ORDER BY b.sort_order;
END;
$$;


--
-- Name: generate_hmis_106a_tb(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_hmis_106a_tb(p_clinic_id uuid, p_fy_start_year integer, p_quarter integer) RETURNS TABLE(element_code text, section text, display_name text, sort_order integer, male_under_2 bigint, female_under_2 bigint, male_2_4 bigint, female_2_4 bigint, male_5_14 bigint, female_5_14 bigint, male_15_49 bigint, female_15_49 bigint, male_50_plus bigint, female_50_plus bigint, total bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  SELECT period_start, period_end INTO v_start, v_end
  FROM uganda_fy_quarter_bounds(p_fy_start_year, p_quarter);

  RETURN QUERY
  WITH base AS (
    SELECT e.element_code, e.section, e.display_name, e.sort_order
    FROM hmis_106a_elements e
    WHERE e.report = 'tb' AND e.is_active
  ),
  tb AS (
    SELECT
      t.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(t.patient_id, t.registered_at)) AS age_band
    FROM tb_episodes t
    JOIN patients pat ON pat.id = t.patient_id
    WHERE t.clinic_id = p_clinic_id
  ),
  tb_registered AS (
    SELECT * FROM tb WHERE registered_at >= v_start AND registered_at < v_end
  ),
  tb_counts AS (
    SELECT 'TB_NEW_SMEAR_POS' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'pulmonary_smear_positive' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_NEW_SMEAR_NEG', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'pulmonary_smear_negative' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_NEW_EPT', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'extrapulmonary' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_RELAPSE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'relapse' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_RETREAT_DEFAULT', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'retreatment_default' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_FAILURE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'failure' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OTHER', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'other' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_HIV_POSITIVE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE hiv_status = 'positive' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_TREATMENT_STARTED', sex, age_band, COUNT(*)
    FROM tb_registered WHERE treatment_started_at IS NOT NULL
      AND treatment_started_at >= v_start AND treatment_started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_CURED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'cured' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_COMPLETED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'completed' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_FAILURE', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'failure' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_DEFAULT', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'default' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_TRANSFERRED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'transferred_out' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_DIED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'died' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
  ),
  tpt AS (
    SELECT t.*, pat.sex, hiv_hmis_age_band(patient_age_years_at(t.patient_id, t.started_at)) AS age_band
    FROM tb_preventive_treatment t
    JOIN patients pat ON pat.id = t.patient_id
    WHERE t.clinic_id = p_clinic_id
  ),
  tpt_counts AS (
    SELECT 'TPT_PLHIV_STARTED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM tpt WHERE indication = 'plhiv' AND started_at >= v_start AND started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_PLHIV_COMPLETED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'plhiv' AND completed AND completed_at >= v_start AND completed_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_CHILD_STARTED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'child_contact' AND started_at >= v_start AND started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_CHILD_COMPLETED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'child_contact' AND completed AND completed_at >= v_start AND completed_at < v_end GROUP BY sex, age_band
  ),
  all_counts AS (
    SELECT * FROM tb_counts
    UNION ALL SELECT * FROM tpt_counts
  )
  SELECT
    b.element_code,
    b.section,
    b.display_name,
    b.sort_order,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n), 0)::BIGINT
  FROM base b
  LEFT JOIN all_counts ac ON ac.code = b.element_code
  GROUP BY b.element_code, b.section, b.display_name, b.sort_order
  ORDER BY b.sort_order;
END;
$$;


--
-- Name: generate_patient_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_patient_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  -- Get clinic receipt prefix (reuse from payments)
  SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
  INTO v_prefix
  FROM clinics
  WHERE id = NEW.clinic_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'KH';
  END IF;

  -- Advisory lock for concurrency safety
  PERFORM pg_advisory_xact_lock(hashtext('patient_seq:' || NEW.clinic_id::text));

  -- Increment sequence
  INSERT INTO patient_number_sequences (clinic_id, last_number)
  VALUES (NEW.clinic_id, 1)
  ON CONFLICT (clinic_id)
  DO UPDATE SET last_number = patient_number_sequences.last_number + 1
  RETURNING last_number INTO v_seq;

  -- Format: KDC-0042
  NEW.patient_number := v_prefix || '-' || LPAD(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$;


--
-- Name: generate_receipt_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_receipt_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_prefix TEXT;
  v_kampala_date DATE;
  v_date TEXT;
  v_seq INTEGER;
BEGIN
  -- Get clinic receipt prefix
  SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
  INTO v_prefix
  FROM clinics
  WHERE id = NEW.clinic_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'KH';
  END IF;

  -- One date for both the receipt string and the sequence row.
  v_kampala_date := kampala_today();
  v_date := TO_CHAR(v_kampala_date, 'YYYYMMDD');

  -- Acquire advisory lock scoped to this clinic + date to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id::text || v_date));

  -- Upsert sequence counter (same Kampala date as the string above)
  INSERT INTO payment_receipt_sequences (clinic_id, sequence_date, last_sequence)
  VALUES (NEW.clinic_id, v_kampala_date, 1)
  ON CONFLICT (clinic_id, sequence_date)
  DO UPDATE SET last_sequence = payment_receipt_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;

  -- Format receipt number: KH-KDC-20260330-0042
  NEW.receipt_number := 'KH-' || v_prefix || '-' || v_date || '-' || LPAD(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$;


--
-- Name: get_clinic_by_clerk_org(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_clinic_by_clerk_org(org_id text) RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT id FROM clinics WHERE clerk_organization_id = org_id AND is_active = TRUE LIMIT 1;
$$;


--
-- Name: get_clinic_queue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_clinic_queue(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, patient_phone text, queue_position integer, queue_status text, priority text, chief_complaint text, checked_in_at timestamp with time zone, nurse_id uuid, nurse_name text, doctor_id uuid, doctor_name text, wait_minutes integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  -- Service-role callers have no JWT subject; trust them.
  -- All other callers must be active staff at the requested clinic.
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
    COALESCE(p.whatsapp_number, '') AS patient_phone,
    v.queue_position,
    v.queue_status::TEXT,
    v.priority::TEXT,
    v.chief_complaint,
    v.checked_in_at,
    v.nurse_id,
    n.display_name AS nurse_name,
    v.doctor_id,
    d.display_name AS doctor_name,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff n ON n.id = v.nurse_id
  LEFT JOIN staff d ON d.id = v.doctor_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date = kampala_today()
    AND v.queue_status NOT IN ('cancelled', 'completed')
  ORDER BY
    CASE v.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
    END,
    v.queue_position ASC NULLS LAST;
END;
$$;


--
-- Name: get_clinic_queue(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_clinic_queue(p_clinic_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, patient_phone text, queue_position integer, queue_status text, priority text, chief_complaint text, checked_in_at timestamp with time zone, nurse_id uuid, nurse_name text, doctor_id uuid, doctor_name text, wait_minutes integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- If staff_id provided, verify they belong to this clinic
  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v.id AS visit_id,
    v.patient_id,
    p.display_name AS patient_name,
    p.whatsapp_number AS patient_phone,
    v.queue_position,
    v.queue_status,
    v.priority,
    v.chief_complaint,
    v.checked_in_at,
    v.nurse_id,
    n.display_name AS nurse_name,
    v.doctor_id,
    d.display_name AS doctor_name,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff n ON n.id = v.nurse_id
  LEFT JOIN staff d ON d.id = v.doctor_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date = CURRENT_DATE
    AND v.queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
  ORDER BY
    CASE v.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    v.queue_position;
END;
$$;


--
-- Name: get_clinician_home(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_clinician_home(p_clinic_id uuid, p_staff_id uuid, p_department text DEFAULT 'opd'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_today DATE := kampala_today();
  v_queue JSONB;
  v_to_dictate JSONB;
  v_to_review JSONB;
  v_done_count INT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  -- Authorization: service-role bypasses; everyone else must be active staff
  -- of the requested clinic AND match the requested staff_id (no peeking at
  -- another clinician's home).
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this home';
    END IF;
  END IF;

  -- Today's queue: anyone in this department waiting or with me right now,
  -- plus patients triaged and ready (so I can claim them).
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.priority_order, t.queue_position NULLS LAST), '[]'::jsonb)
  INTO v_queue
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      p.sex,
      p.date_of_birth,
      v.queue_status,
      v.queue_position,
      v.priority,
      v.chief_complaint,
      v.checked_in_at,
      EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INT / 60 AS wait_minutes,
      CASE v.priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
      END AS priority_order
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
      AND (v.doctor_id IS NULL OR v.doctor_id = p_staff_id)
  ) t;

  -- Visits I'm leading that need a dictation (status=pending, queue=with_doctor).
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.checked_in_at), '[]'::jsonb)
  INTO v_to_dictate
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      v.chief_complaint,
      v.checked_in_at
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.doctor_id = p_staff_id
      AND v.status = 'pending'
      AND v.queue_status = 'with_doctor'
  ) t;

  -- AI-structured notes awaiting my review.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.checked_in_at), '[]'::jsonb)
  INTO v_to_review
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      v.chief_complaint,
      v.checked_in_at
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.doctor_id = p_staff_id
      AND v.status = 'review'
  ) t;

  -- Completed-today count (cheap aggregate; the list itself is lazy-loaded).
  SELECT COUNT(*)::INT INTO v_done_count
  FROM visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = v_today
    AND v.doctor_id = p_staff_id
    AND v.status IN ('sent', 'completed');

  RETURN jsonb_build_object(
    'queue', v_queue,
    'to_dictate', v_to_dictate,
    'to_review', v_to_review,
    'done_count', v_done_count
  );
END;
$$;


--
-- Name: get_current_clinic_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_clinic_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_sub TEXT;
  v_clinic UUID;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT clinic_id INTO v_clinic FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_clinic;
END;
$$;


--
-- Name: get_current_staff_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_staff_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_sub TEXT;
  v_id UUID;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT id INTO v_id FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_id;
END;
$$;


--
-- Name: get_current_staff_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_staff_role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_sub TEXT;
  v_role TEXT;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT role INTO v_role FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_role;
END;
$$;


--
-- Name: hiv_hmis_age_band(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hiv_hmis_age_band(p_age_years integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_age_years IS NULL THEN 'unknown'
    WHEN p_age_years < 2 THEN 'under_2'
    WHEN p_age_years < 5 THEN 'age_2_4'
    WHEN p_age_years < 15 THEN 'age_5_14'
    WHEN p_age_years < 50 THEN 'age_15_49'
    ELSE 'age_50_plus'
  END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE clerk_user_id = auth.jwt()->>'sub'
      AND role = 'admin'
      AND is_active = TRUE
      AND deactivated_at IS NULL
  );
$$;


--
-- Name: is_diocese_coordinator(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_diocese_coordinator(p_diocese text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM diocese_coordinators
    WHERE clerk_user_id = auth.jwt()->>'sub'
      AND diocese = p_diocese
      AND is_active
  );
$$;


--
-- Name: is_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_superadmin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM superadmins
    WHERE clerk_user_id = auth.jwt()->>'sub' AND is_active
  );
$$;


--
-- Name: is_visit_finalized(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_visit_finalized(p_status text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT p_status IN ('sent', 'completed')
$$;


--
-- Name: FUNCTION is_visit_finalized(p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_visit_finalized(p_status text) IS 'True when a visit''s clinical data is finalized (note signed: status sent|completed). Reports must filter on this.';


--
-- Name: karibu_is_service_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.karibu_is_service_role() RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_claims TEXT;
BEGIN
  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN TRUE;  -- direct DB session, not PostgREST
  END IF;
  RETURN COALESCE(v_claims::jsonb->>'role', '') = 'service_role';
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;


--
-- Name: log_provider_note_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_provider_note_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: log_visit_status_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_visit_status_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: mark_audio_upload_failed(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_audio_upload_failed(p_visit_id uuid, p_error_message text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE audio_uploads
  SET
    status = 'failed',
    error_message = p_error_message,
    retry_count = COALESCE(retry_count, 0) + 1,
    last_retry_at = NOW(),
    processing_lock = NULL,
    locked_at = NULL
  WHERE visit_id = p_visit_id;
END;
$$;


--
-- Name: mark_ready_for_doctor(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_ready_for_doctor(p_visit_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_visit RECORD;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  IF p_staff_id IS NOT NULL THEN
    IF v_visit.nurse_id != p_staff_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role = 'admin'
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned nurse or admin can mark ready';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'ready_for_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'with_nurse';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in with_nurse status';
  END IF;
END;
$$;


--
-- Name: match_medical_corpus(public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_medical_corpus(query_embedding public.vector, match_count integer DEFAULT 6) RETURNS TABLE(id bigint, document_id bigint, document_title text, document_slug text, source_org text, source_year integer, section text, section_anchor text, content text, distance double precision)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    c.id,
    c.document_id,
    d.title AS document_title,
    d.slug AS document_slug,
    d.source_org,
    d.source_year,
    c.section,
    c.section_anchor,
    c.content,
    (c.embedding <=> query_embedding)::float AS distance
  FROM medical_corpus c
  JOIN medical_documents d ON d.id = c.document_id
  WHERE d.is_published = TRUE
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- Name: FUNCTION match_medical_corpus(query_embedding public.vector, match_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_medical_corpus(query_embedding public.vector, match_count integer) IS 'Cosine-similarity retrieval over published medical_corpus chunks. Returns chunks ordered by distance (lower is more similar). Used by the Inngest reviewClinicianNote function.';


--
-- Name: maybe_complete_visit_queue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.maybe_complete_visit_queue(p_visit_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visit RECORD;
  v_lab_done BOOLEAN;
  v_pharmacy_done BOOLEAN;
BEGIN
  SELECT id, queue_status, documentation_complete, lab_status,
         dispensing_status, pharmacy_order_submitted_at
    INTO v_visit
    FROM visits
   WHERE id = p_visit_id;

  IF v_visit.id IS NULL THEN
    RETURN;
  END IF;

  -- Idempotent no-op: already completed (or cancelled — never resurrect a
  -- cancelled visit into the completed queue). Do not touch updated_at.
  IF v_visit.queue_status IS NOT DISTINCT FROM 'completed'
     OR v_visit.queue_status IS NOT DISTINCT FROM 'cancelled' THEN
    RETURN;
  END IF;

  IF COALESCE(v_visit.documentation_complete, FALSE) IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Lab done-or-absent: no tests ordered, or every ordered test reached a
  -- terminal state (done / abnormal).
  v_lab_done := v_visit.lab_status IN ('not_ordered', 'done', 'abnormal');

  -- Pharmacy done-or-absent: fully dispensed, or no pharmacy order was ever
  -- submitted. 'in_progress' / 'partial' / 'out_of_stock' are NOT terminal —
  -- they still need a pharmacist action, so the queue stays open through
  -- those states.
  v_pharmacy_done := v_visit.dispensing_status = 'dispensed'
    OR (v_visit.dispensing_status = 'not_started'
        AND v_visit.pharmacy_order_submitted_at IS NULL);

  IF NOT (v_lab_done AND v_pharmacy_done) THEN
    RETURN;
  END IF;

  -- Payment is deliberately NOT a condition above (locked product decision:
  -- payment is decoupled from clinical closure).
  UPDATE visits
     SET queue_status = 'completed',
         updated_at = NOW()
   WHERE id = p_visit_id
     AND queue_status IS DISTINCT FROM 'completed'
     AND queue_status IS DISTINCT FROM 'cancelled';
END;
$$;


--
-- Name: onboarding_required_modules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.onboarding_required_modules() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT ARRAY[
    'records-register',
    'nurse-vitals',
    'clinician-note-pharmacy',
    'lab-result',
    'pharmacy-dispense',
    'billing-payment'
  ]::TEXT[];
$$;


--
-- Name: parse_tests_ordered(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parse_tests_ordered(p_tests_ordered text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT TRIM(t)
      FROM unnest(string_to_array(COALESCE(p_tests_ordered, ''), ',')) AS t
      WHERE TRIM(t) <> ''
    ),
    ARRAY[]::TEXT[]
  );
$$;


--
-- Name: patient_age_years(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patient_age_years(p_patient_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_precision TEXT;
  v_dob DATE;
  v_birth_year SMALLINT;
  v_approx_age SMALLINT;
  v_age_recorded_at TIMESTAMPTZ;
BEGIN
  SELECT dob_precision, date_of_birth, birth_year, approximate_age, age_recorded_at
    INTO v_precision, v_dob, v_birth_year, v_approx_age, v_age_recorded_at
    FROM patients WHERE id = p_patient_id;

  IF v_precision = 'exact' AND v_dob IS NOT NULL THEN
    RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, v_dob))::INTEGER;
  ELSIF v_precision = 'year_only' AND v_birth_year IS NOT NULL THEN
    RETURN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - v_birth_year::INTEGER;
  ELSIF v_precision = 'age_estimate' AND v_approx_age IS NOT NULL AND v_age_recorded_at IS NOT NULL THEN
    RETURN v_approx_age + EXTRACT(YEAR FROM age(CURRENT_DATE, v_age_recorded_at::DATE))::INTEGER;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;


--
-- Name: patient_age_years_at(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patient_age_years_at(p_patient_id uuid, p_as_of date) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT CASE
    WHEN p.dob_precision = 'exact' AND p.date_of_birth IS NOT NULL THEN
      EXTRACT(YEAR FROM age(p_as_of, p.date_of_birth::DATE))::INT
    WHEN p.dob_precision = 'year_only' AND p.birth_year IS NOT NULL THEN
      EXTRACT(YEAR FROM p_as_of)::INT - p.birth_year
    WHEN p.dob_precision = 'age_estimate'
      AND p.approximate_age IS NOT NULL
      AND p.age_recorded_at IS NOT NULL THEN
      p.approximate_age
        + EXTRACT(YEAR FROM age(p_as_of, p.age_recorded_at::DATE))::INT
    ELSE NULL
  END
  FROM patients p
  WHERE p.id = p_patient_id;
$$;


--
-- Name: patient_age_years_from_fields(text, date, smallint, smallint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patient_age_years_from_fields(p_dob_precision text, p_date_of_birth date, p_birth_year smallint, p_approximate_age smallint, p_age_recorded_at timestamp with time zone) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT CASE
    WHEN p_dob_precision = 'exact' AND p_date_of_birth IS NOT NULL THEN
      EXTRACT(YEAR FROM age(CURRENT_DATE, p_date_of_birth))::INTEGER
    WHEN p_dob_precision = 'year_only' AND p_birth_year IS NOT NULL THEN
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - p_birth_year::INTEGER
    WHEN p_dob_precision = 'age_estimate'
      AND p_approximate_age IS NOT NULL
      AND p_age_recorded_at IS NOT NULL THEN
      p_approximate_age
        + EXTRACT(YEAR FROM age(CURRENT_DATE, p_age_recorded_at::DATE))::INTEGER
    ELSE NULL
  END;
$$;


--
-- Name: pharmacy_resolve_dispenser_staff_id(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pharmacy_resolve_dispenser_staff_id(p_clinic_id uuid, p_dispensed_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF karibu_is_service_role() THEN
    v_staff_id := p_dispensed_by;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'staff context required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = v_staff_id
        AND s.clinic_id = p_clinic_id
        AND s.is_active = TRUE
        AND s.deactivated_at IS NULL
        AND s.role IN ('admin', 'dispenser', 'clinical_officer')
    ) THEN
      RAISE EXCEPTION 'Unauthorized role';
    END IF;
    RETURN v_staff_id;
  END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff context required';
  END IF;
  RETURN v_staff_id;
END;
$$;


--
-- Name: purge_old_sync_operations(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_sync_operations(p_retention_days integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM sync_operations
  WHERE applied_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: rebuild_visit_medications_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_visit_medications_summary(p_visit_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_summary TEXT;
BEGIN
  SELECT string_agg(
    format_prescription_line_summary(
      medication_code, free_text_name, dose_text, route_text,
      frequency_text, duration_text, quantity_prescribed, quantity_unit
    ),
    E'\n'
    ORDER BY sort_order, ordered_at, id
  )
  INTO v_summary
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  RETURN NULLIF(TRIM(v_summary), '');
END;
$$;


--
-- Name: recompute_pharmacy_stock_item_quantity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_pharmacy_stock_item_quantity(p_stock_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE pharmacy_stock_items psi
  SET
    quantity_on_hand = COALESCE((
      SELECT SUM(b.quantity_on_hand)
      FROM pharmacy_stock_batches b
      WHERE b.stock_item_id = p_stock_item_id
        AND b.active
    ), 0),
    updated_at = NOW()
  WHERE psi.id = p_stock_item_id;
END;
$$;


--
-- Name: release_audio_processing_lock(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_audio_processing_lock(p_visit_id uuid, p_lock_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE audio_uploads
  SET
    processing_lock = NULL,
    locked_at = NULL
  WHERE visit_id = p_visit_id
    AND processing_lock = p_lock_id;
END;
$$;


--
-- Name: rpc_activate_clinical_protocol(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_activate_clinical_protocol(p_patient_id uuid, p_protocol_slug text, p_visit_id uuid DEFAULT NULL::uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: rpc_active_admissions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_active_admissions(p_clinic_id uuid) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, date_of_birth date, sex text, ward text, bed_label text, admission_type text, chief_complaint text, weight_kg numeric, admitted_at timestamp with time zone, last_observed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
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
    (SELECT MAX(o.observed_at) FROM admission_observations o WHERE o.admission_id = a.id) AS last_observed_at
  FROM admissions a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'active'
  ORDER BY a.admitted_at DESC;
END;
$$;


--
-- Name: rpc_active_hiv_care(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_active_hiv_care(p_clinic_id uuid) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, enrolled_at date, care_status text, who_stage smallint, art_start_date date, art_regimen text, art_line text, cpt_at_last_visit boolean, tb_assessed_last_visit boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    h.id, h.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    h.enrolled_at, h.care_status, h.who_stage, h.art_start_date, h.art_regimen, h.art_line,
    h.cpt_at_last_visit, h.tb_assessed_last_visit
  FROM hiv_care_enrollments h
  JOIN patients p ON p.id = h.patient_id
  WHERE h.clinic_id = p_clinic_id
    AND h.care_status IN ('pre_art', 'on_art')
  ORDER BY h.enrolled_at DESC;
$$;


--
-- Name: rpc_active_pregnancies(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_active_pregnancies(p_clinic_id uuid) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, lmp date, edd date, gravida smallint, para smallint, blood_group text, hiv_status text, syphilis_status text, hepb_status text, risk_notes text, contact_count bigint, iptp_count bigint, td_count bigint, last_contact_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    pg.id, pg.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    pg.lmp, pg.edd, pg.gravida, pg.para,
    pg.blood_group, pg.hiv_status, pg.syphilis_status, pg.hepb_status, pg.risk_notes,
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id),
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.iptp_given),
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.td_given),
    (SELECT MAX(c.contact_date) FROM anc_contacts c WHERE c.pregnancy_id = pg.id)
  FROM pregnancies pg
  JOIN patients p ON p.id = pg.patient_id
  WHERE pg.clinic_id = p_clinic_id AND pg.status = 'active'
  ORDER BY pg.edd NULLS LAST;
END;
$$;


--
-- Name: rpc_active_protocols_for_clinic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_active_protocols_for_clinic(p_clinic_id uuid) RETURNS TABLE(protocol text, scope_type text, scope_value text, note text, activated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT rp.protocol, rp.scope_type, rp.scope_value, rp.note, rp.activated_at
  FROM region_protocols rp
  JOIN clinics c ON c.id = p_clinic_id
  WHERE rp.active
    AND (
      (rp.scope_type = 'district' AND rp.scope_value = c.district)
      OR (rp.scope_type = 'diocese' AND rp.scope_value = c.diocese)
    );
$$;


--
-- Name: rpc_active_tb_episodes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_active_tb_episodes(p_clinic_id uuid) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, unit_tb_number text, registered_at date, case_type text, disease_class text, hiv_status text, treatment_started_at date, outcome text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    t.id, t.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    t.unit_tb_number, t.registered_at, t.case_type, t.disease_class, t.hiv_status,
    t.treatment_started_at, t.outcome
  FROM tb_episodes t
  JOIN patients p ON p.id = t.patient_id
  WHERE t.clinic_id = p_clinic_id AND t.outcome = 'ongoing'
  ORDER BY t.registered_at DESC;
$$;


--
-- Name: rpc_add_charge(uuid, uuid, text, integer, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_add_charge(p_clinic_id uuid, p_patient_id uuid, p_description text, p_amount_ugx integer, p_visit_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  INSERT INTO charges (clinic_id, patient_id, visit_id, description, category, amount_ugx, source, created_by)
  VALUES (p_clinic_id, p_patient_id, p_visit_id, p_description, p_category, p_amount_ugx, p_source, get_current_staff_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: rpc_add_medication_order(uuid, uuid, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_add_medication_order(p_id uuid, p_admission_id uuid, p_drug_name text, p_dose text DEFAULT NULL::text, p_route text DEFAULT NULL::text, p_frequency text DEFAULT NULL::text, p_instructions text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO medication_orders (
    id, admission_id, clinic_id, patient_id,
    drug_name, dose, route, frequency, instructions, ordered_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id,
    p_drug_name, p_dose, p_route, p_frequency, p_instructions, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'add_medication_order', 'medication_orders', p_id);
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: rpc_addend_provider_note(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_addend_provider_note(p_id uuid, p_addendum_text text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_role       TEXT;
  v_clinic     UUID;
  v_staff_id   UUID;
  v_patient    UUID;
  v_visit      UUID;
  v_note_clinic UUID;
  v_status     TEXT;
  v_addendum_id UUID;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can addend notes; role: %', v_role;
  END IF;

  IF p_addendum_text IS NULL OR length(trim(p_addendum_text)) = 0 THEN
    RAISE EXCEPTION 'Addendum text is required';
  END IF;

  SELECT pn.patient_id, pn.visit_id, p.clinic_id, pn.status
    INTO v_patient, v_visit, v_note_clinic, v_status
    FROM provider_notes pn
    JOIN patients p ON p.id = pn.patient_id
    WHERE pn.id = p_id
      AND (v_clinic IS NULL OR p.clinic_id = v_clinic);

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_status NOT IN ('signed', 'cosigned', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only addend a signed note; current status: %', v_status;
  END IF;

  INSERT INTO provider_note_addendums (
    parent_note_id, clinic_id, patient_id, visit_id, addendum_text, created_by
  ) VALUES (
    p_id, v_note_clinic, v_patient, v_visit, p_addendum_text, v_staff_id
  ) RETURNING id INTO v_addendum_id;

  -- Bump status to 'addended' unless the parent is already cosigned/amended —
  -- those represent stronger states we don't want to downgrade.
  UPDATE provider_notes
    SET status     = CASE WHEN status IN ('cosigned', 'amended') THEN status ELSE 'addended' END,
        updated_at = NOW()
    WHERE id = p_id;

  RETURN v_addendum_id;
END;
$$;


--
-- Name: rpc_admin_purge_clinical_data_before(date, uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admin_purge_clinical_data_before(p_cutoff_date date, p_clinic_id uuid DEFAULT NULL::uuid, p_delete_orphan_patients boolean DEFAULT true, p_dry_run boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    delivered_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text,
    oxytocin_given boolean DEFAULT false NOT NULL,
    blood_loss_ml integer,
    placenta_complete boolean,
    outcome text,
    baby_sex text,
    birth_weight_g integer,
    apgar_1 smallint,
    apgar_5 smallint,
    resuscitation_done boolean DEFAULT false NOT NULL,
    vitamin_k_given boolean DEFAULT false NOT NULL,
    early_breastfeeding boolean DEFAULT false NOT NULL,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_admission_delivery(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_delivery(p_admission_id uuid) RETURNS SETOF public.deliveries
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM deliveries WHERE admission_id = p_admission_id LIMIT 1;
END;
$$;


--
-- Name: iv_infusion_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iv_infusion_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    infusion_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    drip_running boolean DEFAULT true NOT NULL,
    site_ok boolean DEFAULT true NOT NULL,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_admission_iv_infusion_checks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_iv_infusion_checks(p_admission_id uuid) RETURNS SETOF public.iv_infusion_checks
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM iv_infusion_checks
  WHERE admission_id = p_admission_id
  ORDER BY checked_at DESC;
END;
$$;


--
-- Name: iv_infusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iv_infusions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    fluid_type text NOT NULL,
    additive text,
    volume_ml smallint NOT NULL,
    rate_ml_hr smallint,
    drops_per_min smallint,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    site_location text,
    notes text,
    started_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_admission_iv_infusions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_iv_infusions(p_admission_id uuid) RETURNS SETOF public.iv_infusions
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM iv_infusions
  WHERE admission_id = p_admission_id
  ORDER BY active DESC, started_at DESC;
END;
$$;


--
-- Name: medication_administrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_administrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    status text NOT NULL,
    not_given_reason text,
    administered_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_for timestamp with time zone,
    CONSTRAINT medication_administrations_status_check CHECK ((status = ANY (ARRAY['given'::text, 'not_given'::text])))
);


--
-- Name: rpc_admission_medication_admins(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_medication_admins(p_admission_id uuid) RETURNS SETOF public.medication_administrations
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM medication_administrations
  WHERE admission_id = p_admission_id
  ORDER BY administered_at DESC;
END;
$$;


--
-- Name: medication_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    drug_name text NOT NULL,
    dose text,
    route text,
    frequency text,
    instructions text,
    active boolean DEFAULT true NOT NULL,
    ordered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_admission_medication_orders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_medication_orders(p_admission_id uuid) RETURNS SETOF public.medication_orders
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM medication_orders
  WHERE admission_id = p_admission_id
  ORDER BY active DESC, created_at DESC;
END;
$$;


--
-- Name: rpc_admission_notes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_notes(p_admission_id uuid) RETURNS TABLE(id uuid, admission_id uuid, note text, author_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT n.id, n.admission_id, n.note, s.display_name, n.created_at
  FROM admission_notes n
  LEFT JOIN staff s ON s.id = n.recorded_by
  WHERE n.admission_id = p_admission_id
  ORDER BY n.created_at DESC;
END;
$$;


--
-- Name: admission_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admission_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    temp_c numeric,
    pulse_bpm smallint,
    resp_rate smallint,
    bp_systolic smallint,
    bp_diastolic smallint,
    spo2_pct smallint,
    avpu text,
    imci_not_feeding boolean DEFAULT false NOT NULL,
    imci_vomiting_everything boolean DEFAULT false NOT NULL,
    imci_convulsions boolean DEFAULT false NOT NULL,
    imci_lethargic_unconscious boolean DEFAULT false NOT NULL,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_admission_observations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_observations(p_admission_id uuid) RETURNS SETOF public.admission_observations
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM admission_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
END;
$$;


--
-- Name: postnatal_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postnatal_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    subject text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    temp_c numeric,
    pulse_bpm smallint,
    resp_rate smallint,
    bp_systolic smallint,
    bp_diastolic smallint,
    bleeding text,
    fundus_firm boolean,
    feeding_well boolean,
    not_feeding boolean DEFAULT false NOT NULL,
    convulsions boolean DEFAULT false NOT NULL,
    jaundice boolean DEFAULT false NOT NULL,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT postnatal_observations_subject_check CHECK ((subject = ANY (ARRAY['mother'::text, 'newborn'::text])))
);


--
-- Name: rpc_admission_postnatal_obs(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admission_postnatal_obs(p_admission_id uuid) RETURNS SETOF public.postnatal_observations
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM postnatal_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
END;
$$;


--
-- Name: rpc_admit_patient(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admit_patient(p_patient_id uuid, p_ward_label text DEFAULT NULL::text, p_chief_complaint text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: rpc_admit_patient_v2(uuid, text, text, text, text, numeric, text, smallint, smallint, date, smallint, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_admit_patient_v2(p_patient_id uuid, p_ward text DEFAULT 'general'::text, p_bed_label text DEFAULT NULL::text, p_chief_complaint text DEFAULT NULL::text, p_admission_type text DEFAULT NULL::text, p_weight_kg numeric DEFAULT NULL::numeric, p_provisional_dx text DEFAULT NULL::text, p_gravida smallint DEFAULT NULL::smallint, p_para smallint DEFAULT NULL::smallint, p_edd date DEFAULT NULL::date, p_gestation_weeks smallint DEFAULT NULL::smallint, p_hiv_status text DEFAULT NULL::text, p_presenting_status text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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

  INSERT INTO admissions (
    clinic_id, patient_id, ward, ward_label, bed_label, chief_complaint,
    admission_type, weight_kg, provisional_dx,
    gravida, para, edd, gestation_weeks, hiv_status, presenting_status,
    created_by
  )
  VALUES (
    v_clinic_id, p_patient_id, COALESCE(p_ward, 'general'), p_bed_label, p_bed_label, p_chief_complaint,
    p_admission_type, p_weight_kg, p_provisional_dx,
    p_gravida, p_para, p_edd, p_gestation_weeks, p_hiv_status, p_presenting_status,
    get_current_staff_id()
  )
  RETURNING id INTO v_admission_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'admit_patient_v2', 'admissions', v_admission_id);
  RETURN v_admission_id;
END;
$$;


--
-- Name: rpc_amend_provider_note(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_amend_provider_note(p_id uuid, p_transcript text, p_reason text, p_note_content text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_role             TEXT;
  v_clinic           UUID;
  v_staff_id         UUID;
  v_status           TEXT;
  v_patient          UUID;
  v_note_clinic      UUID;
  v_prior_transcript TEXT;
  v_prior_content    TEXT;
  v_amendment_id     UUID;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only attending clinicians can amend notes; role: %', v_role;
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Amendment reason is required';
  END IF;

  SELECT pn.status, pn.patient_id, pn.transcript, pn.note_content, p.clinic_id
    INTO v_status, v_patient, v_prior_transcript, v_prior_content, v_note_clinic
    FROM provider_notes pn
    JOIN patients p ON p.id = pn.patient_id
    WHERE pn.id = p_id
      AND (v_clinic IS NULL OR p.clinic_id = v_clinic);

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_status NOT IN ('signed', 'cosigned', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only amend a signed note; current status: %', v_status;
  END IF;

  INSERT INTO provider_note_amendments (
    parent_note_id, clinic_id, patient_id,
    prior_transcript, prior_note_content,
    new_transcript, new_note_content,
    reason, amended_by
  ) VALUES (
    p_id, v_note_clinic, v_patient,
    v_prior_transcript, v_prior_content,
    p_transcript, COALESCE(p_note_content, v_prior_content),
    p_reason, v_staff_id
  ) RETURNING id INTO v_amendment_id;

  UPDATE provider_notes
    SET transcript    = p_transcript,
        note_content  = COALESCE(p_note_content, note_content),
        status        = 'amended',
        amended_at    = NOW(),
        amended_by    = v_staff_id,
        updated_at    = NOW()
    WHERE id = p_id;

  RETURN v_amendment_id;
END;
$$;


--
-- Name: rpc_append_consult_message(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_append_consult_message(p_thread_id uuid, p_role text, p_content text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic UUID;
  v_msg_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM consult_threads WHERE id = p_thread_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT karibu_is_service_role() THEN
    IF v_clinic IS DISTINCT FROM get_current_clinic_id() THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_role <> 'user' THEN
      RAISE EXCEPTION 'Only user messages may be appended by clients';
    END IF;
  END IF;

  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO consult_messages (thread_id, role, content)
  VALUES (p_thread_id, p_role, TRIM(p_content))
  RETURNING id INTO v_msg_id;

  UPDATE consult_threads SET updated_at = NOW() WHERE id = p_thread_id;
  RETURN v_msg_id;
END;
$$;


--
-- Name: rpc_billing_patient_balances(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_billing_patient_balances(p_clinic_id uuid) RETURNS TABLE(patient_id uuid, patient_name text, charged bigint, paid bigint, balance bigint, last_charge_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  WITH charge_totals AS (
    SELECT c.patient_id,
           SUM(c.amount_ugx)::BIGINT AS charged,
           MAX(c.created_at) AS last_charge_at
    FROM charges c
    WHERE c.clinic_id = p_clinic_id AND NOT c.voided
    GROUP BY c.patient_id
  ),
  pay_totals AS (
    SELECT pm.patient_id,
           SUM(pm.amount_ugx + COALESCE(pm.amount_barter_ugx, 0))::BIGINT AS paid
    FROM payments pm
    WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
    GROUP BY pm.patient_id
  )
  SELECT
    p.id,
    TRIM(COALESCE(p.display_name, p.first_name || ' ' || p.last_name))::TEXT,
    COALESCE(ct.charged, 0),
    COALESCE(pt.paid, 0),
    COALESCE(ct.charged, 0) - COALESCE(pt.paid, 0),
    ct.last_charge_at
  FROM patients p
  LEFT JOIN charge_totals ct ON ct.patient_id = p.id
  LEFT JOIN pay_totals pt ON pt.patient_id = p.id
  WHERE p.clinic_id = p_clinic_id
    AND (COALESCE(ct.charged, 0) > 0 OR COALESCE(pt.paid, 0) > 0)
  ORDER BY (COALESCE(ct.charged, 0) - COALESCE(pt.paid, 0)) DESC, ct.last_charge_at DESC NULLS LAST;
END;
$$;


--
-- Name: rpc_cancel_appointment(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_cancel_appointment(p_clinic_id uuid, p_appointment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  UPDATE appointments
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
    AND status <> 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
END;
$$;


--
-- Name: rpc_cancel_care_task(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_cancel_care_task(p_task_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: rpc_chart_access_for_patient(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_chart_access_for_patient(p_patient_id uuid) RETURNS TABLE(staff_display_name text, surface text, accessed_on date, first_at timestamp with time zone, last_at timestamp with time zone, access_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: rpc_check_out_visit(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_check_out_visit(p_visit_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM visits WHERE id = p_visit_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic);

  UPDATE visits
     SET queue_status = 'completed',
         updated_at = NOW()
   WHERE id = p_visit_id;
END;
$$;


--
-- Name: rpc_clinic_cashflow(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_clinic_cashflow(p_clinic_id uuid, p_from date, p_to date) RETURNS TABLE(revenue bigint, charged bigint, outstanding bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(amount_ugx) FROM payments pm
              WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
                AND pm.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT,
    COALESCE((SELECT SUM(amount_ugx) FROM charges c
              WHERE c.clinic_id = p_clinic_id AND NOT c.voided
                AND c.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT,
    GREATEST(0, (
      COALESCE((SELECT SUM(amount_ugx) FROM charges c
                WHERE c.clinic_id = p_clinic_id AND NOT c.voided
                  AND c.created_at::date BETWEEN p_from AND p_to), 0)
      - COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
                  WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
                    AND pm.created_at::date BETWEEN p_from AND p_to), 0)
    ))::BIGINT;
END;
$$;


--
-- Name: rpc_complete_care_task(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_care_task(p_task_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_task_clinic UUID;
  v_staff_id UUID;
BEGIN
  SELECT clinic_id INTO v_task_clinic FROM care_tasks WHERE id = p_task_id;
  IF v_task_clinic IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_task_clinic);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  v_staff_id := get_current_staff_id();

  UPDATE care_tasks
    SET status = 'completed',
        completed_at = NOW(),
        completed_by = v_staff_id
    WHERE id = p_task_id
      AND status != 'completed';

  PERFORM sync_op_record(
    p_client_op_id, v_task_clinic, 'complete_care_task', 'care_tasks', p_task_id
  );
END;
$$;


--
-- Name: rpc_complete_legacy_pharmacy_dispense(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_legacy_pharmacy_dispense(p_visit_id uuid, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'staff context required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND pharmacy_order_submitted_at IS NOT NULL
      AND COALESCE(TRIM(medications), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM prescription_orders po
        WHERE po.visit_id = p_visit_id
          AND po.clinic_id = v_clinic_id
          AND po.status NOT IN ('cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'Legacy dispense only for free-text medication visits without structured lines';
  END IF;

  UPDATE visits
  SET
    dispensing_status = 'dispensed',
    dispense_notes = COALESCE(NULLIF(TRIM(p_notes), ''), dispense_notes),
    dispensed_at = NOW(),
    dispensed_by = v_staff_id,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_legacy_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_complete_legacy_pharmacy_dispense(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_legacy_pharmacy_dispense(p_visit_id uuid, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid, p_dispensed_by uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  v_staff_id := pharmacy_resolve_dispenser_staff_id(v_clinic_id, p_dispensed_by);

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND pharmacy_order_submitted_at IS NOT NULL
      AND COALESCE(TRIM(medications), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM prescription_orders po
        WHERE po.visit_id = p_visit_id
          AND po.clinic_id = v_clinic_id
          AND po.status NOT IN ('cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'Legacy dispense only for free-text medication visits without structured lines';
  END IF;

  UPDATE visits
  SET
    dispensing_status = 'dispensed',
    dispense_notes = COALESCE(NULLIF(TRIM(p_notes), ''), dispense_notes),
    dispensed_at = NOW(),
    dispensed_by = v_staff_id,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_legacy_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_complete_onboarding_module(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_onboarding_module(p_module_id text, p_score integer DEFAULT NULL::integer, p_total integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id UUID;
  v_required TEXT[];
  v_done INTEGER;
  v_completed_at TIMESTAMPTZ;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  v_required := onboarding_required_modules();
  IF NOT (p_module_id = ANY (v_required)) THEN
    RAISE EXCEPTION 'Unknown onboarding module: %', p_module_id;
  END IF;

  INSERT INTO staff_onboarding_progress (staff_id, module_id, score, total)
  VALUES (v_staff_id, p_module_id, p_score, p_total)
  ON CONFLICT (staff_id, module_id) DO UPDATE SET
    completed_at = NOW(),
    score = COALESCE(EXCLUDED.score, staff_onboarding_progress.score),
    total = COALESCE(EXCLUDED.total, staff_onboarding_progress.total);

  SELECT COUNT(*)::INTEGER INTO v_done
  FROM staff_onboarding_progress
  WHERE staff_id = v_staff_id
    AND module_id = ANY (v_required);

  IF v_done >= cardinality(v_required) THEN
    UPDATE staff
    SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_staff_id
    RETURNING onboarding_completed_at INTO v_completed_at;
  ELSE
    SELECT onboarding_completed_at INTO v_completed_at
    FROM staff WHERE id = v_staff_id;
  END IF;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'completed', v_completed_at IS NOT NULL,
    'completed_at', v_completed_at,
    'modules_done', v_done,
    'modules_required', cardinality(v_required)
  );
END;
$$;


--
-- Name: rpc_complete_pharmacy_dispense(uuid, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_pharmacy_dispense(p_visit_id uuid, p_lines jsonb, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
  v_line JSONB;
  v_prescription_id UUID;
  v_line_status TEXT;
  v_qty NUMERIC;
  v_qty_unit TEXT;
  v_stock_item_id UUID;
  v_stock_qty NUMERIC;
  v_batch TEXT;
  v_substitute TEXT;
  v_line_notes TEXT;
  v_movement_id UUID;
  v_staff_id UUID;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one dispense line required';
  END IF;

  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff context required';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_prescription_id := (v_line->>'prescription_order_id')::uuid;
    v_line_status := NULLIF(TRIM(v_line->>'line_status'), '');
    v_qty := NULLIF(v_line->>'quantity_dispensed', '')::numeric;
    v_qty_unit := NULLIF(TRIM(v_line->>'quantity_unit'), '');
    v_stock_item_id := NULLIF(v_line->>'stock_item_id', '')::uuid;
    v_stock_qty := ABS(COALESCE(NULLIF(v_line->>'stock_quantity', '')::numeric, v_qty, 0));
    v_batch := NULLIF(TRIM(v_line->>'batch_number'), '');
    v_substitute := NULLIF(TRIM(v_line->>'substitute_medication_code'), '');
    v_line_notes := NULLIF(TRIM(v_line->>'notes'), '');

    IF v_prescription_id IS NULL OR v_line_status IS NULL THEN
      RAISE EXCEPTION 'Each line requires prescription_order_id and line_status';
    END IF;

    IF v_line_status NOT IN ('dispensed', 'partially_dispensed', 'out_of_stock') THEN
      RAISE EXCEPTION 'Invalid line_status: %', v_line_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM prescription_orders
      WHERE id = v_prescription_id
        AND visit_id = p_visit_id
        AND clinic_id = v_clinic_id
        AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
    ) THEN
      RAISE EXCEPTION 'Prescription line not found or not dispensable: %', v_prescription_id;
    END IF;

    v_movement_id := NULL;
    IF v_stock_item_id IS NOT NULL AND v_stock_qty > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_items
        WHERE id = v_stock_item_id AND clinic_id = v_clinic_id AND active
      ) THEN
        RAISE EXCEPTION 'Invalid stock item';
      END IF;

      INSERT INTO pharmacy_stock_movements (
        stock_item_id, clinic_id, movement_type, quantity_delta,
        visit_id, recorded_by, batch_number, notes, prescription_order_id
      ) VALUES (
        v_stock_item_id, v_clinic_id, 'dispensed', -v_stock_qty,
        p_visit_id, v_staff_id, v_batch, v_line_notes, v_prescription_id
      )
      RETURNING id INTO v_movement_id;

      UPDATE pharmacy_stock_items
      SET
        quantity_on_hand = GREATEST(0, quantity_on_hand - v_stock_qty),
        updated_at = NOW()
      WHERE id = v_stock_item_id AND clinic_id = v_clinic_id;
    END IF;

    INSERT INTO dispense_records (
      prescription_order_id, visit_id, clinic_id, dispensed_by,
      quantity_dispensed, quantity_unit, line_status,
      substitute_medication_code, stock_item_id, stock_movement_id, notes
    ) VALUES (
      v_prescription_id, p_visit_id, v_clinic_id, v_staff_id,
      v_qty, v_qty_unit, v_line_status,
      v_substitute, v_stock_item_id, v_movement_id, v_line_notes
    );

    UPDATE prescription_orders
    SET status = CASE v_line_status
      WHEN 'dispensed' THEN 'dispensed'
      WHEN 'partially_dispensed' THEN 'partially_dispensed'
      WHEN 'out_of_stock' THEN 'out_of_stock'
    END
    WHERE id = v_prescription_id;

    IF v_line_status IN ('dispensed', 'partially_dispensed') THEN
      PERFORM billing_charge_pharmacy_line(p_visit_id, v_prescription_id);
    END IF;
  END LOOP;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE dispensed_at
    END,
    dispensed_by = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN v_staff_id
      ELSE dispensed_by
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_complete_pharmacy_dispense(uuid, jsonb, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_pharmacy_dispense(p_visit_id uuid, p_lines jsonb, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid, p_dispensed_by uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_line JSONB;
  v_prescription_id UUID;
  v_line_status TEXT;
  v_qty NUMERIC;
  v_qty_unit TEXT;
  v_stock_item_id UUID;
  v_stock_qty NUMERIC;
  v_batch TEXT;
  v_batch_id UUID;
  v_substitute TEXT;
  v_line_notes TEXT;
  v_movement_id UUID;
  v_staff_id UUID;
  v_agg_status TEXT;
  v_prescribed NUMERIC;
  v_already NUMERIC;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one dispense line required';
  END IF;

  v_staff_id := pharmacy_resolve_dispenser_staff_id(v_clinic_id, p_dispensed_by);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_prescription_id := (v_line->>'prescription_order_id')::uuid;
    v_line_status := NULLIF(TRIM(v_line->>'line_status'), '');
    v_qty := NULLIF(v_line->>'quantity_dispensed', '')::numeric;
    v_qty_unit := NULLIF(TRIM(v_line->>'quantity_unit'), '');
    v_stock_item_id := NULLIF(v_line->>'stock_item_id', '')::uuid;
    v_stock_qty := ABS(COALESCE(NULLIF(v_line->>'stock_quantity', '')::numeric, v_qty, 0));
    v_batch := NULLIF(TRIM(v_line->>'batch_number'), '');
    v_batch_id := NULLIF(v_line->>'batch_id', '')::uuid;
    v_substitute := NULLIF(TRIM(v_line->>'substitute_medication_code'), '');
    v_line_notes := NULLIF(TRIM(v_line->>'notes'), '');

    IF v_prescription_id IS NULL OR v_line_status IS NULL THEN
      RAISE EXCEPTION 'Each line requires prescription_order_id and line_status';
    END IF;

    IF v_line_status NOT IN ('dispensed', 'partially_dispensed', 'out_of_stock') THEN
      RAISE EXCEPTION 'Invalid line_status: %', v_line_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM prescription_orders
      WHERE id = v_prescription_id
        AND visit_id = p_visit_id
        AND clinic_id = v_clinic_id
        AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
    ) THEN
      RAISE EXCEPTION 'Prescription line not found or not dispensable: %', v_prescription_id;
    END IF;

    IF v_line_status IN ('dispensed', 'partially_dispensed') AND v_qty IS NOT NULL AND v_qty > 0 THEN
      SELECT quantity_prescribed INTO v_prescribed
      FROM prescription_orders WHERE id = v_prescription_id;
      IF v_prescribed IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity_dispensed), 0) INTO v_already
        FROM dispense_records
        WHERE prescription_order_id = v_prescription_id
          AND line_status IN ('dispensed', 'partially_dispensed');
        IF v_already + v_qty > v_prescribed THEN
          RAISE EXCEPTION
            'Dispensed quantity (% already + % now) exceeds prescribed % for this line',
            v_already, v_qty, v_prescribed;
        END IF;
      END IF;
    END IF;

    v_movement_id := NULL;
    IF v_stock_item_id IS NOT NULL AND v_stock_qty > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_items
        WHERE id = v_stock_item_id AND clinic_id = v_clinic_id AND active
      ) THEN
        RAISE EXCEPTION 'Invalid stock item';
      END IF;

      IF v_batch_id IS NULL THEN
        v_batch_id := rpc_suggest_fefo_batch(v_stock_item_id, v_stock_qty);
      END IF;

      IF v_batch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_batches
        WHERE id = v_batch_id
          AND stock_item_id = v_stock_item_id
          AND clinic_id = v_clinic_id
          AND active
      ) THEN
        RAISE EXCEPTION 'Invalid batch for stock item';
      END IF;

      INSERT INTO pharmacy_stock_movements (
        stock_item_id, clinic_id, movement_type, quantity_delta,
        visit_id, recorded_by, batch_number, notes, prescription_order_id, batch_id
      ) VALUES (
        v_stock_item_id, v_clinic_id, 'dispensed', -v_stock_qty,
        p_visit_id, v_staff_id, v_batch, v_line_notes, v_prescription_id, v_batch_id
      )
      RETURNING id INTO v_movement_id;
    END IF;

    INSERT INTO dispense_records (
      prescription_order_id, visit_id, clinic_id, dispensed_by,
      quantity_dispensed, quantity_unit, line_status,
      substitute_medication_code, stock_item_id, stock_movement_id, notes
    ) VALUES (
      v_prescription_id, p_visit_id, v_clinic_id, v_staff_id,
      v_qty, v_qty_unit, v_line_status,
      v_substitute, v_stock_item_id, v_movement_id, v_line_notes
    );

    UPDATE prescription_orders
    SET status = CASE v_line_status
      WHEN 'dispensed' THEN 'dispensed'
      WHEN 'partially_dispensed' THEN 'partially_dispensed'
      WHEN 'out_of_stock' THEN 'out_of_stock'
    END
    WHERE id = v_prescription_id;

    IF v_line_status IN ('dispensed', 'partially_dispensed') THEN
      PERFORM billing_charge_pharmacy_line(p_visit_id, v_prescription_id);
    END IF;
  END LOOP;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE dispensed_at
    END,
    dispensed_by = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN v_staff_id
      ELSE dispensed_by
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_cosign_provider_note(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_cosign_provider_note(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_role       TEXT;
  v_clinic     UUID;
  v_staff_id   UUID;
  v_creator    UUID;
  v_status     TEXT;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only attending clinicians can cosign notes; role: %', v_role;
  END IF;

  SELECT created_by, status INTO v_creator, v_status
    FROM provider_notes
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_creator = v_staff_id THEN
    RAISE EXCEPTION 'Cosigner must be different from the original author';
  END IF;

  IF v_status NOT IN ('signed', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only cosign a signed note; current status: %', v_status;
  END IF;

  UPDATE provider_notes
    SET status          = 'cosigned',
        cosigned_at     = NOW(),
        cosigned_by     = v_staff_id,
        requires_cosign = FALSE,
        updated_at      = NOW()
    WHERE id = p_id;
END;
$$;


--
-- Name: rpc_count_review_items(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_count_review_items(p_clinic_id uuid, p_from date, p_to date) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_unfinalized INTEGER;
  v_uncoded INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_unfinalized
  FROM rpc_unfinalized_visits(p_clinic_id, p_from, p_to);

  SELECT COUNT(*)::INTEGER INTO v_uncoded
  FROM visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date >= p_from
    AND v.visit_date <= p_to
    AND v.status IN ('sent', 'completed')
    AND NOT EXISTS (
      SELECT 1 FROM visit_diagnosis_codes vdc
      WHERE vdc.visit_id = v.id
        AND vdc.source IN ('manual', 'ai_confirmed')
    );

  RETURN COALESCE(v_unfinalized, 0) + COALESCE(v_uncoded, 0);
END;
$$;


--
-- Name: rpc_create_appointment(uuid, text, timestamp with time zone, uuid, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_appointment(p_clinic_id uuid, p_event_type text, p_scheduled_at timestamp with time zone, p_patient_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_scheduled_end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  INSERT INTO appointments (clinic_id, patient_id, event_type, title, reason, scheduled_at, scheduled_end, unit, created_by)
  VALUES (p_clinic_id, p_patient_id, p_event_type, p_title, p_reason, p_scheduled_at, p_scheduled_end, p_unit, get_current_staff_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: rpc_create_care_task(uuid, uuid, text, text, text, uuid, text, uuid, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_care_task(p_clinic_id uuid, p_patient_id uuid, p_task_type text, p_title text, p_description text DEFAULT NULL::text, p_visit_id uuid DEFAULT NULL::uuid, p_assignee_role text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_op_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id UUID;
  v_patient_clinic UUID;
  v_task_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT entity_id INTO v_task_id FROM sync_operations
    WHERE id = p_client_op_id;
    IF v_task_id IS NOT NULL THEN RETURN v_task_id; END IF;
    RETURN gen_random_uuid();
  END IF;

  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

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
$$;


--
-- Name: rpc_create_patient(uuid, uuid, text, text, text, date, text, smallint, smallint, timestamp with time zone, text, text, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_patient(p_id uuid, p_clinic_id uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_whatsapp_number text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_sex text DEFAULT NULL::text, p_birth_year smallint DEFAULT NULL::smallint, p_approximate_age smallint DEFAULT NULL::smallint, p_age_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_dob_precision text DEFAULT 'unknown'::text, p_village text DEFAULT NULL::text, p_parish text DEFAULT NULL::text, p_subcounty text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_guardian_name text DEFAULT NULL::text, p_guardian_relationship text DEFAULT NULL::text, p_national_id text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  PERFORM assert_onboarding_complete();
  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF p_guardian_relationship IS NOT NULL
     AND TRIM(p_guardian_relationship) NOT IN (
       'mother', 'father', 'husband', 'wife', 'relative', 'neighbor'
     ) THEN
    RAISE EXCEPTION 'Invalid guardian_relationship';
  END IF;

  INSERT INTO patients (
    id,
    clinic_id,
    first_name,
    last_name,
    whatsapp_number,
    date_of_birth,
    sex,
    birth_year,
    approximate_age,
    age_recorded_at,
    dob_precision,
    village,
    parish,
    subcounty,
    district,
    guardian_name,
    guardian_relationship,
    national_id
  ) VALUES (
    p_id,
    p_clinic_id,
    NULLIF(TRIM(p_first_name), ''),
    NULLIF(TRIM(p_last_name), ''),
    NULLIF(TRIM(p_whatsapp_number), ''),
    p_date_of_birth,
    NULLIF(TRIM(p_sex), ''),
    p_birth_year,
    p_approximate_age,
    p_age_recorded_at,
    COALESCE(NULLIF(TRIM(p_dob_precision), ''), 'unknown'),
    NULLIF(TRIM(p_village), ''),
    NULLIF(TRIM(p_parish), ''),
    NULLIF(TRIM(p_subcounty), ''),
    NULLIF(TRIM(p_district), ''),
    NULLIF(TRIM(p_guardian_name), ''),
    NULLIF(TRIM(p_guardian_relationship), ''),
    NULLIF(TRIM(p_national_id), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, patients.first_name),
    last_name = COALESCE(EXCLUDED.last_name, patients.last_name),
    whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, patients.whatsapp_number),
    date_of_birth = COALESCE(EXCLUDED.date_of_birth, patients.date_of_birth),
    sex = COALESCE(EXCLUDED.sex, patients.sex),
    birth_year = COALESCE(EXCLUDED.birth_year, patients.birth_year),
    approximate_age = COALESCE(EXCLUDED.approximate_age, patients.approximate_age),
    age_recorded_at = COALESCE(EXCLUDED.age_recorded_at, patients.age_recorded_at),
    dob_precision = COALESCE(EXCLUDED.dob_precision, patients.dob_precision),
    village = COALESCE(EXCLUDED.village, patients.village),
    parish = COALESCE(EXCLUDED.parish, patients.parish),
    subcounty = COALESCE(EXCLUDED.subcounty, patients.subcounty),
    district = COALESCE(EXCLUDED.district, patients.district),
    guardian_name = COALESCE(EXCLUDED.guardian_name, patients.guardian_name),
    guardian_relationship = COALESCE(EXCLUDED.guardian_relationship, patients.guardian_relationship),
    national_id = COALESCE(EXCLUDED.national_id, patients.national_id),
    updated_at = NOW();

  PERFORM sync_op_record(p_client_op_id, p_clinic_id, 'create_patient', 'patients', p_id);
END;
$$;


--
-- Name: rpc_create_referral(uuid, uuid, uuid, uuid, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_referral(p_id uuid, p_clinic_id uuid, p_patient_id uuid, p_visit_id uuid, p_from_department text, p_to_facility text, p_urgency text, p_reason text, p_clinical_summary text DEFAULT NULL::text, p_transport_mode text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_staff_id UUID;
  v_row referrals%ROWTYPE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT * INTO v_row FROM referrals WHERE id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'created_at', v_row.created_at);
    END IF;
    RETURN jsonb_build_object('id', p_id);
  END IF;

  IF p_urgency NOT IN ('routine', 'urgent', 'emergency') THEN
    RAISE EXCEPTION 'Invalid urgency: %', p_urgency;
  END IF;

  IF NULLIF(TRIM(p_to_facility), '') IS NULL THEN
    RAISE EXCEPTION 'to_facility required';
  END IF;

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  IF p_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = p_clinic_id
      AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'Visit/patient/clinic mismatch';
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO referrals (
    id,
    clinic_id,
    patient_id,
    visit_id,
    from_department,
    to_facility,
    urgency,
    reason,
    clinical_summary,
    transport_mode,
    referred_by,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_clinic_id,
    p_patient_id,
    p_visit_id,
    COALESCE(NULLIF(TRIM(p_from_department), ''), 'opd'),
    TRIM(p_to_facility),
    p_urgency,
    TRIM(p_reason),
    NULLIF(TRIM(p_clinical_summary), ''),
    NULLIF(TRIM(p_transport_mode), ''),
    v_staff_id,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    to_facility = EXCLUDED.to_facility,
    urgency = EXCLUDED.urgency,
    reason = EXCLUDED.reason,
    clinical_summary = EXCLUDED.clinical_summary,
    transport_mode = EXCLUDED.transport_mode,
    updated_at = NOW();

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'create_referral', 'referrals', p_id
  );

  SELECT * INTO v_row FROM referrals WHERE id = p_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'status', v_row.status
  );
END;
$$;


--
-- Name: rpc_create_visit(uuid, uuid, uuid, uuid, text, date, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_visit(p_id uuid, p_clinic_id uuid, p_patient_id uuid, p_doctor_id uuid DEFAULT NULL::uuid, p_chief_complaint text DEFAULT NULL::text, p_visit_date date DEFAULT public.kampala_today(), p_department text DEFAULT 'opd'::text, p_admission_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_clinic UUID;
  v_queue_position INTEGER;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  v_queue_position := assign_today_number(p_clinic_id, p_visit_date);

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority, queue_position, checked_in_at,
    admission_id
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    p_department, 'pending', 'waiting', 'normal', v_queue_position, NOW(),
    p_admission_id
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;


--
-- Name: rpc_discharge_admission(uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_discharge_admission(p_admission_id uuid, p_outcome text, p_disposition text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  -- 'died' is recorded as an outcome but keeps status semantics consistent:
  -- the patient leaves the active ward either way.
  UPDATE admissions
  SET status = CASE WHEN p_disposition = 'referred' THEN 'transferred' ELSE 'discharged' END,
      discharged_at = COALESCE(discharged_at, NOW()),
      outcome = p_outcome,
      disposition = p_disposition,
      discharge_notes = p_notes,
      discharged_by = get_current_staff_id(),
      updated_at = NOW()
  WHERE id = p_admission_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'discharge_admission', 'admissions', p_admission_id);
  END IF;
  RETURN p_admission_id;
END;
$$;


--
-- Name: rpc_discharged_admissions(uuid, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_discharged_admissions(p_clinic_id uuid, p_from date, p_to date, p_outcome text DEFAULT NULL::text) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, date_of_birth date, sex text, ward text, bed_label text, admission_type text, chief_complaint text, weight_kg numeric, admitted_at timestamp with time zone, last_observed_at timestamp with time zone, discharged_at timestamp with time zone, outcome text, disposition text, discharge_notes text, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: rpc_finalize_clinical_encounter(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_finalize_clinical_encounter(p_note_id uuid, p_visit_id uuid, p_patient_id uuid, p_transcript text, p_patient_summary text, p_diagnosis text DEFAULT NULL::text, p_medications text DEFAULT NULL::text, p_follow_up_instructions text DEFAULT NULL::text, p_tests_ordered text DEFAULT NULL::text, p_structured_data text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_staff_id UUID;
  v_mid_level BOOLEAN;
  v_structured_json JSONB;
  v_summary_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
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

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_find_duplicate_candidates(uuid, text, text, text, text, integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_find_duplicate_candidates(p_clinic_id uuid, p_first_name text, p_last_name text, p_village text DEFAULT NULL::text, p_parish text DEFAULT NULL::text, p_age integer DEFAULT NULL::integer, p_sex text DEFAULT NULL::text, p_limit integer DEFAULT 5) RETURNS TABLE(id uuid, patient_id bigint, first_name text, last_name text, sex text, date_of_birth date, birth_year smallint, approximate_age smallint, dob_precision text, village text, parish text, guardian_name text, national_id text, whatsapp_number text, derived_age integer, match_score real, match_reasons text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := lower(trim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')));
  IF v_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      p.*,
      patient_age_years(p.id) AS d_age,
      levenshtein(v_name, lower(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')))) AS name_dist
    FROM patients p
    WHERE p.clinic_id = p_clinic_id
  )
  SELECT
    sc.id,
    sc.patient_id,
    sc.first_name,
    sc.last_name,
    sc.sex,
    sc.date_of_birth,
    sc.birth_year,
    sc.approximate_age,
    sc.dob_precision,
    sc.village,
    sc.parish,
    sc.guardian_name,
    sc.national_id,
    sc.whatsapp_number,
    sc.d_age AS derived_age,
    (1.0 - LEAST(sc.name_dist, 5)::REAL / 5.0) AS match_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN sc.name_dist = 0 THEN 'name_match' ELSE 'similar_name' END,
      CASE WHEN p_age IS NOT NULL AND sc.d_age = p_age THEN 'same_age' END,
      CASE WHEN p_village IS NOT NULL AND lower(sc.village) = lower(p_village) THEN 'same_village' END
    ], NULL) AS match_reasons
  FROM scored sc
  WHERE sc.name_dist <= 2
    AND (
      (p_age IS NOT NULL AND sc.d_age = p_age)   -- same name (<=2) AND same birth year
      OR (p_age IS NULL AND sc.name_dist = 0)     -- unknown age: only exact-name dups
    )
  ORDER BY sc.name_dist ASC, sc.d_age NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: rpc_generate_charges_from_visit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_generate_charges_from_visit(p_visit_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visit RECORD;
  v_added INTEGER := 0;
  v_lab RECORD;
  v_po RECORD;
  v_before INTEGER;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  SELECT COUNT(*)::INTEGER INTO v_before
  FROM charges WHERE visit_id = p_visit_id AND NOT voided;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  FOR v_lab IN
    SELECT elem FROM jsonb_array_elements(COALESCE(v_visit.lab_test_results, '[]'::jsonb)) AS elem
    WHERE elem->>'status' IN ('done', 'abnormal')
  LOOP
    PERFORM billing_charge_lab_test(p_visit_id, v_lab.elem->>'test');
  END LOOP;

  FOR v_po IN
    SELECT id FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND status IN ('dispensed', 'partially_dispensed')
  LOOP
    PERFORM billing_charge_pharmacy_line(p_visit_id, v_po.id);
  END LOOP;

  SELECT COUNT(*)::INTEGER - v_before INTO v_added
  FROM charges WHERE visit_id = p_visit_id AND NOT voided;

  RETURN GREATEST(v_added, 0);
END;
$$;


--
-- Name: rpc_get_clinic_catalog(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_clinic_catalog(p_clinic_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
          'drug_name', mc.generic_name,
          'code', mc.code,
          'category', COALESCE(cpf.category, mc.category),
          'display_order', COALESCE(cpf.display_order, mc.display_order),
          'is_available', (
            mc.active
            AND COALESCE(cpf.active, TRUE)
            AND COALESCE(cpf.in_stock, TRUE)
          ),
          'notes', cpf.notes,
          'aliases', to_jsonb(mc.aliases),
          'strengths', to_jsonb(mc.strengths),
          'default_frequency', mc.default_frequency,
          'default_route', mc.default_route,
          'warning_text', mc.warning_text,
          'formulation', mc.formulation,
          'quantity_unit', mc.unit
        ) ORDER BY COALESCE(cpf.display_order, mc.display_order), mc.generic_name
      )
      FROM medication_catalog mc
      LEFT JOIN clinic_pharmacy_formulary cpf
        ON cpf.clinic_id = p_clinic_id
       AND (
         cpf.medication_code = mc.code
         OR (cpf.medication_code IS NULL AND LOWER(TRIM(cpf.drug_name)) = LOWER(TRIM(mc.generic_name)))
       )
      WHERE mc.active
        AND NOT (
          cpf.clinic_id IS NOT NULL
          AND (cpf.active = FALSE OR cpf.in_stock = FALSE)
        )
    ), '[]'::jsonb)
  );
END;
$$;


--
-- Name: rpc_get_cme_module_detail(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_cme_module_detail(p_module_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'module', (
      SELECT jsonb_build_object('id', m.id, 'slug', m.slug, 'title', m.title, 'description', m.description)
      FROM cme_modules m WHERE m.id = p_module_id AND m.published = TRUE
    ),
    'lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'slug', l.slug, 'title', l.title,
        'body_markdown', l.body_markdown, 'library_slug', l.library_slug
      ) ORDER BY l.display_order)
      FROM cme_lessons l WHERE l.module_id = p_module_id
    ), '[]'::jsonb),
    'flashcards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front_text', f.front_text, 'back_text', f.back_text
      ) ORDER BY f.display_order)
      FROM cme_flashcards f WHERE f.module_id = p_module_id
    ), '[]'::jsonb),
    'quiz_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'choices', q.choices,
        'correct_index', q.correct_index, 'explanation', q.explanation
      ) ORDER BY q.display_order)
      FROM cme_quiz_questions q WHERE q.module_id = p_module_id
    ), '[]'::jsonb)
  );
$$;


--
-- Name: rpc_get_cme_modules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_cme_modules() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'slug', m.slug,
      'title', m.title,
      'description', m.description,
      'display_order', m.display_order
    ) ORDER BY m.display_order, m.title
  ), '[]'::jsonb)
  FROM cme_modules m
  WHERE m.published = TRUE;
$$;


--
-- Name: rpc_get_consult_thread(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_consult_thread(p_thread_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'thread', (
      SELECT jsonb_build_object(
        'id', t.id,
        'visit_id', t.visit_id,
        'status', t.status,
        'redacted_snapshot', t.redacted_snapshot,
        'read_only', v.documentation_complete
      )
      FROM consult_threads t
      JOIN visits v ON v.id = t.visit_id
      WHERE t.id = p_thread_id AND t.clinic_id = get_current_clinic_id()
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'content', m.content, 'created_at', m.created_at
      ) ORDER BY m.created_at)
      FROM consult_messages m
      WHERE m.thread_id = p_thread_id
    ), '[]'::jsonb)
  );
$$;


--
-- Name: rpc_get_onboarding_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_onboarding_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id UUID;
  v_completed_at TIMESTAMPTZ;
  v_modules JSONB;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  SELECT onboarding_completed_at INTO v_completed_at
  FROM staff WHERE id = v_staff_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'module_id', p.module_id,
        'completed_at', p.completed_at,
        'score', p.score,
        'total', p.total
      )
      ORDER BY p.module_id
    ),
    '[]'::jsonb
  )
  INTO v_modules
  FROM staff_onboarding_progress p
  WHERE p.staff_id = v_staff_id;

  RETURN jsonb_build_object(
    'completed', v_completed_at IS NOT NULL,
    'completed_at', v_completed_at,
    'required_modules', to_jsonb(onboarding_required_modules()),
    'progress', v_modules
  );
END;
$$;


--
-- Name: rpc_get_opd_patients_today(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_opd_patients_today(p_clinic_id uuid, p_filter text DEFAULT NULL::text) RETURNS TABLE(patient_id uuid, patient_name text, sex text, derived_age integer, visit_id uuid, chief_complaint text, queue_status text, queue_position integer, priority text, checked_in_at timestamp with time zone, wait_minutes integer, lab_status text, dispensing_status text, documentation_complete boolean, pharmacy_order_submitted_at timestamp with time zone, note_status text, visit_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
      v.queue_position,
      v.priority,
      v.checked_in_at,
      v.lab_status,
      v.dispensing_status,
      v.documentation_complete,
      v.pharmacy_order_submitted_at,
      v.visit_date,
      pn.status AS note_status
    FROM visits v
    LEFT JOIN provider_notes pn ON pn.visit_id = v.id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date = kampala_today()
    ORDER BY v.patient_id, v.created_at DESC
  )
  SELECT
    tv.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    tv.visit_id,
    tv.chief_complaint,
    tv.queue_status,
    tv.queue_position,
    tv.priority::TEXT,
    tv.checked_in_at,
    EXTRACT(EPOCH FROM (NOW() - tv.checked_in_at))::INTEGER / 60 AS wait_minutes,
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
    OR (p_filter = 'done_today' AND tv.documentation_complete = TRUE)
  ORDER BY
    CASE tv.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    tv.checked_in_at ASC NULLS LAST;
END;
$$;


--
-- Name: rpc_get_patient_latest_vitals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_patient_latest_vitals(p_patient_id uuid) RETURNS TABLE(weight_kg numeric, weight_kg_at timestamp with time zone, height_cm numeric, height_cm_at timestamp with time zone, temp_c numeric, temp_c_at timestamp with time zone, bp_systolic integer, bp_diastolic integer, bp_at timestamp with time zone, pulse_bpm integer, pulse_bpm_at timestamp with time zone, resp_rate integer, resp_rate_at timestamp with time zone, spo2_pct integer, spo2_pct_at timestamp with time zone, muac_cm numeric, muac_cm_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic UUID;
  v_clerk_user_id TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM patients WHERE id = p_patient_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = v_clinic
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Unauthorized for this clinic';
    END IF;
  END IF;

  -- Per-field latest non-null. Each subquery hits idx_patient_vitals_patient
  -- (patient_id, recorded_at DESC) from migration 029. BP systolic/diastolic
  -- share a single timestamp since they're captured together; the joined
  -- subquery returns both with the systolic measurement's recorded_at.
  RETURN QUERY
  SELECT
    (SELECT pv.weight_kg FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.weight_kg IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.weight_kg IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.height_cm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.height_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.height_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.temp_c FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.temp_c IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.temp_c IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.bp_systolic FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.bp_diastolic FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.pulse_bpm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.pulse_bpm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.pulse_bpm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.resp_rate FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.resp_rate IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.resp_rate IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.spo2_pct FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.spo2_pct IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.spo2_pct IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.muac_cm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.muac_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.muac_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1);
END;
$$;


--
-- Name: rpc_get_patient_timeline(uuid, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_patient_timeline(p_patient_id uuid, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50) RETURNS TABLE(event_type text, event_at timestamp with time zone, event_id uuid, event_data jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic UUID;
  v_clerk_user_id TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM patients WHERE id = p_patient_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = v_clinic
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Unauthorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  WITH events AS (
    SELECT
      'visit'::TEXT AS event_type,
      COALESCE(v.checked_in_at, v.created_at) AS event_at,
      v.id AS event_id,
      jsonb_build_object(
        'visit_id', v.id,
        'status', v.status,
        'queue_status', v.queue_status,
        'department', v.department,
        'chief_complaint', v.chief_complaint,
        'diagnosis', v.diagnosis,
        'medications', v.medications,
        'follow_up_instructions', v.follow_up_instructions,
        'tests_ordered', v.tests_ordered,
        'dispensing_status', v.dispensing_status,
        'lab_status', v.lab_status,
        'lab_abnormal', v.lab_abnormal,
        'documentation_complete', v.documentation_complete,
        'visit_date', v.visit_date,
        'doctor_id', v.doctor_id
      ) AS event_data
    FROM visits v
    WHERE v.patient_id = p_patient_id

    UNION ALL

    SELECT
      'note'::TEXT,
      pn.updated_at,
      pn.id,
      jsonb_build_object(
        'note_id', pn.id,
        'visit_id', pn.visit_id,
        'status', pn.status,
        'source', pn.source,
        'transcript_preview', LEFT(COALESCE(pn.transcript, ''), 280),
        'has_transcript', pn.transcript IS NOT NULL AND length(pn.transcript) > 0,
        'signed_at', pn.finalized_at,
        'signed_by', pn.finalized_by,
        'amended_at', pn.amended_at,
        'created_by', pn.created_by,
        'updated_at', pn.updated_at
      )
    FROM provider_notes pn
    WHERE pn.patient_id = p_patient_id
      AND pn.status != 'voided'

    UNION ALL

    SELECT
      'vital'::TEXT,
      pv.recorded_at,
      pv.id,
      jsonb_build_object(
        'vital_id', pv.id,
        'visit_id', pv.visit_id,
        'recorded_by', pv.recorded_by,
        'weight_kg', pv.weight_kg,
        'height_cm', pv.height_cm,
        'temp_c', pv.temp_c,
        'bp_systolic', pv.bp_systolic,
        'bp_diastolic', pv.bp_diastolic,
        'pulse_bpm', pv.pulse_bpm,
        'resp_rate', pv.resp_rate,
        'spo2_pct', pv.spo2_pct,
        'muac_cm', pv.muac_cm,
        'notes', pv.notes
      )
    FROM patient_vitals pv
    WHERE pv.patient_id = p_patient_id

    UNION ALL

    SELECT
      'payment'::TEXT,
      p.created_at,
      p.id,
      jsonb_build_object(
        'payment_id', p.id,
        'visit_id', p.visit_id,
        'amount_ugx', p.amount_ugx,
        'payment_method', p.payment_method,
        'receipt_number', p.receipt_number,
        'service_type', p.service_type,
        'status', p.status,
        'collected_by', p.collected_by
      )
    FROM payments p
    WHERE p.patient_id = p_patient_id

    UNION ALL

    -- Phase 5 care_tasks (migration 041). Cancelled tasks excluded so the
    -- timeline isn't cluttered with withdrawn follow-ups.
    SELECT
      'task'::TEXT,
      ct.created_at,
      ct.id,
      jsonb_build_object(
        'task_id', ct.id,
        'visit_id', ct.visit_id,
        'task_type', ct.task_type,
        'title', ct.title,
        'description', ct.description,
        'assignee_role', ct.assignee_role,
        'assignee_id', ct.assignee_id,
        'due_at', ct.due_at,
        'status', ct.status,
        'completed_at', ct.completed_at,
        'completed_by', ct.completed_by,
        'created_by', ct.created_by
      )
    FROM care_tasks ct
    WHERE ct.patient_id = p_patient_id
      AND ct.status != 'cancelled'
  )
  SELECT e.event_type, e.event_at, e.event_id, e.event_data
  FROM events e
  WHERE p_cursor IS NULL OR e.event_at < p_cursor
  ORDER BY e.event_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: rpc_inpatient_monthly_summary(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_inpatient_monthly_summary(p_clinic_id uuid, p_month date) RETURNS TABLE(admissions integer, discharges integer, recovered integer, improved integer, unchanged integer, referred_out integer, absconded integer, died integer, deliveries integer, mean_length_of_stay_days numeric, bed_days integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  -- Kampala-local calendar month boundaries, expressed as absolute instants
  -- (see header comment for why: matches kampala_today()'s UTC+3 handling).
  v_month_start := (date_trunc('month', p_month::timestamp) AT TIME ZONE 'Africa/Kampala');
  v_month_end := ((date_trunc('month', p_month::timestamp) + INTERVAL '1 month') AT TIME ZONE 'Africa/Kampala');

  RETURN QUERY
  WITH admitted_this_month AS (
    SELECT COUNT(*) AS cnt
    FROM admissions a
    WHERE a.clinic_id = p_clinic_id
      AND a.admitted_at >= v_month_start
      AND a.admitted_at < v_month_end
  ),
  discharged_this_month AS (
    SELECT
      a.outcome,
      a.status,
      a.admitted_at,
      a.discharged_at
    FROM admissions a
    WHERE a.clinic_id = p_clinic_id
      AND a.status IN ('discharged', 'transferred')
      AND a.discharged_at IS NOT NULL
      AND a.discharged_at >= v_month_start
      AND a.discharged_at < v_month_end
  ),
  delivered_this_month AS (
    SELECT COUNT(*) AS cnt
    FROM deliveries d
    WHERE d.clinic_id = p_clinic_id
      AND d.delivered_at >= v_month_start
      AND d.delivered_at < v_month_end
  )
  SELECT
    (SELECT cnt FROM admitted_this_month)::INT AS admissions,
    COUNT(*)::INT AS discharges,
    COUNT(*) FILTER (WHERE dtm.outcome = 'recovered')::INT AS recovered,
    COUNT(*) FILTER (WHERE dtm.outcome = 'improved')::INT AS improved,
    COUNT(*) FILTER (WHERE dtm.outcome = 'unchanged')::INT AS unchanged,
    COUNT(*) FILTER (WHERE dtm.outcome = 'referred' OR dtm.status = 'transferred')::INT AS referred_out,
    COUNT(*) FILTER (WHERE dtm.outcome = 'absconded')::INT AS absconded,
    COUNT(*) FILTER (WHERE dtm.outcome = 'died')::INT AS died,
    (SELECT cnt FROM delivered_this_month)::INT AS deliveries,
    ROUND(AVG(CEIL(EXTRACT(EPOCH FROM (dtm.discharged_at - dtm.admitted_at)) / 86400.0))::numeric, 2) AS mean_length_of_stay_days,
    COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM (dtm.discharged_at - dtm.admitted_at)) / 86400.0)), 0)::INT AS bed_days
  FROM discharged_this_month dtm;
END;
$$;


--
-- Name: rpc_insert_patient_vitals(uuid, uuid, uuid, numeric, numeric, numeric, integer, integer, integer, integer, integer, numeric, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_insert_patient_vitals(p_id uuid, p_patient_id uuid, p_visit_id uuid DEFAULT NULL::uuid, p_weight_kg numeric DEFAULT NULL::numeric, p_height_cm numeric DEFAULT NULL::numeric, p_temp_c numeric DEFAULT NULL::numeric, p_bp_systolic integer DEFAULT NULL::integer, p_bp_diastolic integer DEFAULT NULL::integer, p_pulse_bpm integer DEFAULT NULL::integer, p_resp_rate integer DEFAULT NULL::integer, p_spo2_pct integer DEFAULT NULL::integer, p_muac_cm numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_recorded_at timestamp with time zone DEFAULT now()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_patient_clinic UUID;
  v_visit_clinic UUID;
  v_staff_id UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
  END IF;

  IF p_visit_id IS NOT NULL THEN
    SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic != get_current_clinic_id() THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO patient_vitals (
    id, patient_id, visit_id, recorded_at, recorded_by,
    weight_kg, height_cm, temp_c,
    bp_systolic, bp_diastolic, pulse_bpm, resp_rate, spo2_pct,
    muac_cm, notes
  ) VALUES (
    p_id, p_patient_id, p_visit_id, p_recorded_at, v_staff_id,
    p_weight_kg, p_height_cm, p_temp_c,
    p_bp_systolic, p_bp_diastolic, p_pulse_bpm, p_resp_rate, p_spo2_pct,
    p_muac_cm, p_notes
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;


--
-- Name: rpc_list_appointments(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_appointments(p_clinic_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, event_type text, title text, reason text, scheduled_at timestamp with time zone, scheduled_end timestamp with time zone, unit text, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    a.id, a.patient_id,
    COALESCE(p.display_name, NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')),
    a.event_type, a.title, a.reason, a.scheduled_at, a.scheduled_end, a.unit, a.status
  FROM appointments a
  LEFT JOIN patients p ON p.id = a.patient_id
  WHERE a.clinic_id = p_clinic_id
    AND a.scheduled_at >= p_from
    AND a.scheduled_at < p_to
    AND a.status <> 'cancelled'
  ORDER BY a.scheduled_at ASC;
END;
$$;


--
-- Name: rpc_list_consult_threads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_consult_threads() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'visit_id', t.visit_id,
      'status', t.status,
      'updated_at', t.updated_at,
      'read_only', v.documentation_complete
    ) ORDER BY t.updated_at DESC
  ), '[]'::jsonb)
  FROM consult_threads t
  JOIN visits v ON v.id = t.visit_id
  WHERE t.clinic_id = get_current_clinic_id();
$$;


--
-- Name: rpc_list_referrals_today(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_referrals_today(p_clinic_id uuid) RETURNS TABLE(id uuid, patient_id uuid, visit_id uuid, patient_name text, to_facility text, urgency text, reason text, clinical_summary text, transport_mode text, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    r.id,
    r.patient_id,
    r.visit_id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
      p.display_name,
      'Unknown'
    ) AS patient_name,
    r.to_facility,
    r.urgency,
    r.reason,
    r.clinical_summary,
    r.transport_mode,
    r.status,
    r.created_at
  FROM referrals r
  JOIN patients p ON p.id = r.patient_id
  WHERE r.clinic_id = p_clinic_id
    AND r.created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')
    AND r.status = 'active'
  ORDER BY r.created_at DESC;
END;
$$;


--
-- Name: region_protocols; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_protocols (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    protocol text NOT NULL,
    scope_type text NOT NULL,
    scope_value text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    note text,
    activated_by text,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_by text,
    deactivated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT region_protocols_scope_type_check CHECK ((scope_type = ANY (ARRAY['district'::text, 'diocese'::text])))
);


--
-- Name: rpc_list_region_protocols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_region_protocols() RETURNS SETOF public.region_protocols
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT rp.*
  FROM region_protocols rp
  WHERE is_superadmin()
     OR EXISTS (
       SELECT 1 FROM diocese_coordinators dc
       WHERE dc.clerk_user_id = auth.jwt()->>'sub'
         AND dc.is_active
         AND (
           (rp.scope_type = 'diocese' AND rp.scope_value = dc.diocese)
           OR (rp.scope_type = 'district' AND rp.scope_value IN (
                SELECT district FROM clinics WHERE diocese = dc.diocese
           ))
         )
     )
  ORDER BY rp.active DESC, rp.updated_at DESC;
$$;


--
-- Name: rpc_log_chart_access(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_log_chart_access(p_clinic_id uuid, p_patient_id uuid, p_surface text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: rpc_mark_documentation_complete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_mark_documentation_complete(p_visit_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_patient_balance(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_patient_balance(p_clinic_id uuid, p_patient_id uuid) RETURNS TABLE(charged bigint, paid bigint, balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(amount_ugx) FROM charges c
              WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)::BIGINT,
    COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
              WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0)::BIGINT,
    (COALESCE((SELECT SUM(amount_ugx) FROM charges c
               WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)
     - COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
                 WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0))::BIGINT;
END;
$$;


--
-- Name: rpc_pharmacy_batches_expiring(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_pharmacy_batches_expiring(p_clinic_id uuid, p_days integer DEFAULT 30) RETURNS TABLE(stock_item_id uuid, drug_name text, strength text, formulation text, batch_id uuid, batch_number text, expires_at date, quantity_on_hand numeric, gtin text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_horizon DATE := kampala_today() + GREATEST(1, p_days);
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    psi.id,
    psi.drug_name,
    psi.strength,
    psi.formulation,
    b.id,
    b.batch_number,
    b.expires_at,
    b.quantity_on_hand,
    b.gtin
  FROM pharmacy_stock_batches b
  JOIN pharmacy_stock_items psi ON psi.id = b.stock_item_id
  WHERE b.clinic_id = p_clinic_id
    AND b.active
    AND psi.active
    AND b.quantity_on_hand > 0
    AND b.expires_at IS NOT NULL
    AND b.expires_at <= v_horizon
  ORDER BY b.expires_at ASC, psi.drug_name ASC;
END;
$$;


--
-- Name: anc_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anc_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pregnancy_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    contact_number smallint,
    contact_date timestamp with time zone DEFAULT now() NOT NULL,
    gestation_weeks smallint,
    bp_systolic smallint,
    bp_diastolic smallint,
    weight_kg numeric,
    fundal_height_cm smallint,
    fetal_heart_rate smallint,
    urine_protein text,
    hb numeric,
    iptp_given boolean DEFAULT false NOT NULL,
    ifas_given boolean DEFAULT false NOT NULL,
    td_given boolean DEFAULT false NOT NULL,
    dewormed boolean DEFAULT false NOT NULL,
    itn_given boolean DEFAULT false NOT NULL,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_pregnancy_contacts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_pregnancy_contacts(p_pregnancy_id uuid) RETURNS SETOF public.anc_contacts
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT pg.clinic_id INTO v_clinic_id FROM pregnancies pg WHERE pg.id = p_pregnancy_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM anc_contacts WHERE pregnancy_id = p_pregnancy_id ORDER BY contact_date DESC;
END;
$$;


--
-- Name: rpc_recent_hts_events(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_recent_hts_events(p_clinic_id uuid, p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, patient_id uuid, patient_name text, event_date date, tested boolean, result text, result_received boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    e.id, e.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    e.event_date, e.tested, e.result, e.result_received
  FROM hts_events e
  JOIN patients p ON p.id = e.patient_id
  WHERE e.clinic_id = p_clinic_id
  ORDER BY e.event_date DESC, e.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;


--
-- Name: rpc_record_admission_note(uuid, uuid, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_admission_note(p_id uuid, p_admission_id uuid, p_note text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO admission_notes (id, admission_id, clinic_id, patient_id, note, recorded_by, created_at)
  VALUES (p_id, p_admission_id, v_clinic_id, v_patient_id, p_note, get_current_staff_id(), COALESCE(p_created_at, NOW()))
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_admission_note', 'admission_notes', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_admission_observation(uuid, uuid, timestamp with time zone, numeric, smallint, smallint, smallint, smallint, smallint, text, boolean, boolean, boolean, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_admission_observation(p_id uuid, p_admission_id uuid, p_observed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_temp_c numeric DEFAULT NULL::numeric, p_pulse_bpm smallint DEFAULT NULL::smallint, p_resp_rate smallint DEFAULT NULL::smallint, p_bp_systolic smallint DEFAULT NULL::smallint, p_bp_diastolic smallint DEFAULT NULL::smallint, p_spo2_pct smallint DEFAULT NULL::smallint, p_avpu text DEFAULT NULL::text, p_imci_not_feeding boolean DEFAULT false, p_imci_vomiting_everything boolean DEFAULT false, p_imci_convulsions boolean DEFAULT false, p_imci_lethargic_unconscious boolean DEFAULT false, p_note text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  -- Append-only: the row id is the client-generated UUID, so a replayed op is a
  -- no-op upsert rather than a duplicate round.
  INSERT INTO admission_observations (
    id, admission_id, clinic_id, patient_id, observed_at,
    temp_c, pulse_bpm, resp_rate, bp_systolic, bp_diastolic, spo2_pct, avpu,
    imci_not_feeding, imci_vomiting_everything, imci_convulsions, imci_lethargic_unconscious,
    note, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, COALESCE(p_observed_at, NOW()),
    p_temp_c, p_pulse_bpm, p_resp_rate, p_bp_systolic, p_bp_diastolic, p_spo2_pct, p_avpu,
    p_imci_not_feeding, p_imci_vomiting_everything, p_imci_convulsions, p_imci_lethargic_unconscious,
    p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_admission_observation', 'admission_observations', p_id);
  END IF;

  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_anc_contact(uuid, uuid, smallint, timestamp with time zone, smallint, smallint, smallint, numeric, smallint, smallint, text, numeric, boolean, boolean, boolean, boolean, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_anc_contact(p_id uuid, p_pregnancy_id uuid, p_contact_number smallint DEFAULT NULL::smallint, p_contact_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_gestation_weeks smallint DEFAULT NULL::smallint, p_bp_systolic smallint DEFAULT NULL::smallint, p_bp_diastolic smallint DEFAULT NULL::smallint, p_weight_kg numeric DEFAULT NULL::numeric, p_fundal_height_cm smallint DEFAULT NULL::smallint, p_fetal_heart_rate smallint DEFAULT NULL::smallint, p_urine_protein text DEFAULT NULL::text, p_hb numeric DEFAULT NULL::numeric, p_iptp_given boolean DEFAULT false, p_ifas_given boolean DEFAULT false, p_td_given boolean DEFAULT false, p_dewormed boolean DEFAULT false, p_itn_given boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM pregnancies WHERE id = p_pregnancy_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Pregnancy not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO anc_contacts (
    id, pregnancy_id, clinic_id, patient_id, contact_number, contact_date, gestation_weeks,
    bp_systolic, bp_diastolic, weight_kg, fundal_height_cm, fetal_heart_rate, urine_protein, hb,
    iptp_given, ifas_given, td_given, dewormed, itn_given, notes, recorded_by
  )
  VALUES (
    p_id, p_pregnancy_id, v_clinic_id, v_patient_id, p_contact_number, COALESCE(p_contact_date, NOW()), p_gestation_weeks,
    p_bp_systolic, p_bp_diastolic, p_weight_kg, p_fundal_height_cm, p_fetal_heart_rate, p_urine_protein, p_hb,
    p_iptp_given, p_ifas_given, p_td_given, p_dewormed, p_itn_given, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE pregnancies SET updated_at = NOW() WHERE id = p_pregnancy_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_anc_contact', 'anc_contacts', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_billing_payment(uuid, uuid, integer, text, uuid, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_billing_payment(p_clinic_id uuid, p_patient_id uuid, p_amount_cash_ugx integer, p_payment_method text, p_visit_id uuid DEFAULT NULL::uuid, p_amount_barter_ugx integer DEFAULT 0, p_barter_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_row payments%ROWTYPE;
  v_collected_by UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_amount_cash_ugx < 0 OR COALESCE(p_amount_barter_ugx, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts must be non-negative';
  END IF;
  IF (p_amount_cash_ugx + COALESCE(p_amount_barter_ugx, 0)) <= 0 THEN
    RAISE EXCEPTION 'Payment total must be positive';
  END IF;
  IF p_payment_method NOT IN ('cash', 'mtn_momo', 'airtel_money', 'barter', 'mixed') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_payment_method IN ('barter', 'mixed') AND COALESCE(p_amount_barter_ugx, 0) <= 0 THEN
    RAISE EXCEPTION 'Barter amount required';
  END IF;

  v_collected_by := get_current_staff_id();
  IF v_collected_by IS NULL THEN RAISE EXCEPTION 'collected_by required'; END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, amount_barter_ugx, barter_description,
    payment_method, status, notes, collected_by
  ) VALUES (
    v_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_cash_ugx, COALESCE(p_amount_barter_ugx, 0), p_barter_description,
    p_payment_method, 'paid', p_notes, v_collected_by
  );

  SELECT * INTO v_row FROM payments WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
END;
$$;


--
-- Name: rpc_record_critical_alert_response(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_critical_alert_response(p_alert_id uuid, p_response text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM visit_critical_alerts WHERE id = p_alert_id;
  IF v_clinic IS NULL OR v_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_response NOT IN ('confirmed', 'data_error', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid response';
  END IF;
  UPDATE visit_critical_alerts
  SET clinician_response = p_response,
      responded_at = NOW(),
      responded_by = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1)
  WHERE id = p_alert_id;
END;
$$;


--
-- Name: rpc_record_delivery(uuid, uuid, text, timestamp with time zone, boolean, integer, boolean, text, text, integer, smallint, smallint, boolean, boolean, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_delivery(p_id uuid, p_admission_id uuid, p_mode text DEFAULT NULL::text, p_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_oxytocin_given boolean DEFAULT false, p_blood_loss_ml integer DEFAULT NULL::integer, p_placenta_complete boolean DEFAULT NULL::boolean, p_outcome text DEFAULT NULL::text, p_baby_sex text DEFAULT NULL::text, p_birth_weight_g integer DEFAULT NULL::integer, p_apgar_1 smallint DEFAULT NULL::smallint, p_apgar_5 smallint DEFAULT NULL::smallint, p_resuscitation_done boolean DEFAULT false, p_vitamin_k_given boolean DEFAULT false, p_early_breastfeeding boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO deliveries AS d (
    id, admission_id, clinic_id, patient_id, delivered_at, mode,
    oxytocin_given, blood_loss_ml, placenta_complete,
    outcome, baby_sex, birth_weight_g, apgar_1, apgar_5,
    resuscitation_done, vitamin_k_given, early_breastfeeding, notes, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, COALESCE(p_delivered_at, NOW()), p_mode,
    p_oxytocin_given, p_blood_loss_ml, p_placenta_complete,
    p_outcome, p_baby_sex, p_birth_weight_g, p_apgar_1, p_apgar_5,
    p_resuscitation_done, p_vitamin_k_given, p_early_breastfeeding, p_notes, get_current_staff_id()
  )
  ON CONFLICT (admission_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    delivered_at = EXCLUDED.delivered_at,
    oxytocin_given = EXCLUDED.oxytocin_given,
    blood_loss_ml = EXCLUDED.blood_loss_ml,
    placenta_complete = EXCLUDED.placenta_complete,
    outcome = EXCLUDED.outcome,
    baby_sex = EXCLUDED.baby_sex,
    birth_weight_g = EXCLUDED.birth_weight_g,
    apgar_1 = EXCLUDED.apgar_1,
    apgar_5 = EXCLUDED.apgar_5,
    resuscitation_done = EXCLUDED.resuscitation_done,
    vitamin_k_given = EXCLUDED.vitamin_k_given,
    early_breastfeeding = EXCLUDED.early_breastfeeding,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_delivery', 'deliveries', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_dispense(uuid, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_dispense(p_visit_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_movements jsonb DEFAULT '[]'::jsonb, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_movement JSONB;
  v_stock_item_id UUID;
  v_qty NUMERIC;
  v_batch TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_status NOT IN ('dispensed', 'partial', 'out_of_stock') THEN
    RAISE EXCEPTION 'Invalid terminal dispensing status';
  END IF;

  UPDATE visits
  SET
    dispensing_status = p_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = NOW(),
    dispensed_by = get_current_staff_id(),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  FOR v_movement IN SELECT * FROM jsonb_array_elements(COALESCE(p_movements, '[]'::jsonb))
  LOOP
    v_stock_item_id := (v_movement->>'stock_item_id')::uuid;
    v_qty := ABS((v_movement->>'quantity')::numeric);
    v_batch := NULLIF(TRIM(v_movement->>'batch_number'), '');

    IF v_stock_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pharmacy_stock_items
      WHERE id = v_stock_item_id AND clinic_id = v_clinic_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO pharmacy_stock_movements (
      stock_item_id, clinic_id, movement_type, quantity_delta,
      visit_id, recorded_by, batch_number, notes
    ) VALUES (
      v_stock_item_id, v_clinic_id, 'dispensed', -v_qty,
      p_visit_id, get_current_staff_id(), v_batch,
      'Dispensed via rpc_record_dispense'
    );
  END LOOP;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_dispense', 'visits', p_visit_id);
END;
$$;


--
-- Name: rpc_record_ebola_screening(uuid, uuid, uuid, numeric, boolean, boolean, text, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_ebola_screening(p_id uuid, p_patient_id uuid, p_visit_id uuid DEFAULT NULL::uuid, p_temp_c numeric DEFAULT NULL::numeric, p_epi_contact boolean DEFAULT false, p_unexplained_bleeding boolean DEFAULT false, p_symptoms text DEFAULT NULL::text, p_is_suspect boolean DEFAULT false, p_action_taken text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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


--
-- Name: rpc_record_hts_event(uuid, uuid, date, uuid, boolean, boolean, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_hts_event(p_id uuid, p_patient_id uuid, p_event_date date DEFAULT NULL::date, p_visit_id uuid DEFAULT NULL::uuid, p_counseled boolean DEFAULT true, p_tested boolean DEFAULT false, p_result text DEFAULT NULL::text, p_result_received boolean DEFAULT false, p_first_result_in_fy boolean DEFAULT false, p_suspected_tb boolean DEFAULT false, p_started_cpt boolean DEFAULT false, p_retester boolean DEFAULT false, p_couple_test boolean DEFAULT false, p_couple_concordant boolean DEFAULT NULL::boolean, p_pep boolean DEFAULT false, p_smc_provided boolean DEFAULT false, p_pregnancy_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO hts_events (
    id, clinic_id, patient_id, visit_id, event_date, counseled, tested, result,
    result_received, first_result_in_fy, suspected_tb, started_cpt, retester,
    couple_test, couple_concordant, pep, smc_provided, pregnancy_id, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_visit_id, COALESCE(p_event_date, CURRENT_DATE),
    COALESCE(p_counseled, TRUE), COALESCE(p_tested, FALSE), p_result,
    COALESCE(p_result_received, FALSE), COALESCE(p_first_result_in_fy, FALSE),
    COALESCE(p_suspected_tb, FALSE), COALESCE(p_started_cpt, FALSE),
    COALESCE(p_retester, FALSE), COALESCE(p_couple_test, FALSE), p_couple_concordant,
    COALESCE(p_pep, FALSE), COALESCE(p_smc_provided, FALSE), p_pregnancy_id, p_notes,
    get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_hts_event', 'hts_events', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_iv_infusion_check(uuid, uuid, boolean, boolean, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_iv_infusion_check(p_id uuid, p_infusion_id uuid, p_drip_running boolean DEFAULT true, p_site_ok boolean DEFAULT true, p_note text DEFAULT NULL::text, p_checked_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  SELECT clinic_id, admission_id INTO v_clinic_id, v_admission_id
  FROM iv_infusions WHERE id = p_infusion_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Infusion not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO iv_infusion_checks (
    id, infusion_id, admission_id, clinic_id, checked_at,
    drip_running, site_ok, note, recorded_by
  )
  VALUES (
    p_id, p_infusion_id, v_admission_id, v_clinic_id, COALESCE(p_checked_at, NOW()),
    p_drip_running, p_site_ok, p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_iv_infusion_check', 'iv_infusion_checks', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_lab_result(uuid, text, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_lab_result(p_visit_id uuid, p_result text, p_abnormal boolean DEFAULT false, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_status TEXT;
  v_trimmed TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_trimmed := NULLIF(TRIM(p_result), '');
  IF v_trimmed IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  v_status := CASE WHEN p_abnormal THEN 'abnormal' ELSE 'done' END;

  UPDATE visits
  SET
    lab_status = v_status,
    lab_results = v_trimmed,
    lab_abnormal = p_abnormal,
    lab_completed_at = NOW(),
    lab_completed_by = get_current_staff_id(),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_result', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_record_lab_test_result(uuid, text, text, boolean, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_lab_test_result(p_visit_id uuid, p_test_name text, p_result text, p_abnormal boolean DEFAULT false, p_client_op_id uuid DEFAULT NULL::uuid, p_recorded_by uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

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
        COALESCE(v_doctor_id, v_actor)
      );
    END IF;
  END IF;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_record_medication_admin(uuid, uuid, text, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_medication_admin(p_id uuid, p_order_id uuid, p_status text, p_not_given_reason text DEFAULT NULL::text, p_administered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  IF p_status NOT IN ('given', 'not_given') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT clinic_id, admission_id INTO v_clinic_id, v_admission_id
  FROM medication_orders WHERE id = p_order_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO medication_administrations (
    id, order_id, admission_id, clinic_id, status, not_given_reason, administered_at, recorded_by
  )
  VALUES (
    p_id, p_order_id, v_admission_id, v_clinic_id, p_status, p_not_given_reason,
    COALESCE(p_administered_at, NOW()), get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_medication_admin', 'medication_administrations', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_medication_admin(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_medication_admin(p_id uuid, p_order_id uuid, p_status text, p_not_given_reason text DEFAULT NULL::text, p_administered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  IF p_status NOT IN ('given', 'not_given') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT clinic_id, admission_id INTO v_clinic_id, v_admission_id
  FROM medication_orders WHERE id = p_order_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO medication_administrations (
    id, order_id, admission_id, clinic_id, status, not_given_reason,
    administered_at, scheduled_for, recorded_by
  )
  VALUES (
    p_id, p_order_id, v_admission_id, v_clinic_id, p_status, p_not_given_reason,
    COALESCE(p_administered_at, NOW()), p_scheduled_for, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_medication_admin', 'medication_administrations', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_payment(uuid, uuid, uuid, uuid, integer, text, text, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_payment(p_id uuid, p_visit_id uuid, p_clinic_id uuid, p_patient_id uuid, p_amount_ugx integer, p_payment_method text, p_status text DEFAULT 'paid'::text, p_service_type text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_collected_by uuid DEFAULT NULL::uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_collected_by UUID;
  v_row payments%ROWTYPE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT * INTO v_row FROM payments WHERE id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
    END IF;
    RETURN jsonb_build_object('id', p_id, 'receipt_number', '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id AND clinic_id = p_clinic_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'Visit/patient/clinic mismatch';
  END IF;

  IF karibu_is_service_role() THEN
    -- Web server actions pass the acting staff id (already clinic-scoped).
    v_collected_by := p_collected_by;
  ELSE
    -- Clients record payments as themselves; caller-supplied attribution
    -- is ignored.
    v_collected_by := get_current_staff_id();
  END IF;
  IF v_collected_by IS NULL THEN
    RAISE EXCEPTION 'collected_by required';
  END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, payment_method, status,
    service_type, notes, collected_by
  ) VALUES (
    p_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_ugx, p_payment_method, p_status,
    p_service_type, p_notes, v_collected_by
  )
  ON CONFLICT (id) DO UPDATE SET
    amount_ugx = EXCLUDED.amount_ugx,
    payment_method = EXCLUDED.payment_method,
    status = EXCLUDED.status,
    service_type = EXCLUDED.service_type,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  SELECT * INTO v_row FROM payments WHERE id = p_id;

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'record_payment', 'payments', p_id
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'receipt_number', v_row.receipt_number
  );
END;
$$;


--
-- Name: rpc_record_postnatal_obs(uuid, uuid, text, timestamp with time zone, numeric, smallint, smallint, smallint, smallint, text, boolean, boolean, boolean, boolean, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_postnatal_obs(p_id uuid, p_admission_id uuid, p_subject text, p_observed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_temp_c numeric DEFAULT NULL::numeric, p_pulse_bpm smallint DEFAULT NULL::smallint, p_resp_rate smallint DEFAULT NULL::smallint, p_bp_systolic smallint DEFAULT NULL::smallint, p_bp_diastolic smallint DEFAULT NULL::smallint, p_bleeding text DEFAULT NULL::text, p_fundus_firm boolean DEFAULT NULL::boolean, p_feeding_well boolean DEFAULT NULL::boolean, p_not_feeding boolean DEFAULT false, p_convulsions boolean DEFAULT false, p_jaundice boolean DEFAULT false, p_note text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  IF p_subject NOT IN ('mother', 'newborn') THEN
    RAISE EXCEPTION 'invalid subject: %', p_subject;
  END IF;
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO postnatal_observations (
    id, admission_id, clinic_id, patient_id, subject, observed_at,
    temp_c, pulse_bpm, resp_rate, bp_systolic, bp_diastolic,
    bleeding, fundus_firm, feeding_well, not_feeding, convulsions, jaundice,
    note, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, p_subject, COALESCE(p_observed_at, NOW()),
    p_temp_c, p_pulse_bpm, p_resp_rate, p_bp_systolic, p_bp_diastolic,
    p_bleeding, p_fundus_firm, p_feeding_well, p_not_feeding, p_convulsions, p_jaundice,
    p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_postnatal_obs', 'postnatal_observations', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_review_response(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_review_response(p_suggestion_id uuid, p_response text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM ai_review_suggestions WHERE id = p_suggestion_id;
  IF v_clinic IS NULL OR v_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: suggestion/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_response NOT IN ('considered_proceeded','reopened_note','dismissed') THEN
    RAISE EXCEPTION 'Invalid response: %', p_response;
  END IF;

  UPDATE ai_review_suggestions
  SET clinician_response = p_response,
      responded_at = NOW(),
      responded_by = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1)
  WHERE id = p_suggestion_id;
END;
$$;


--
-- Name: rpc_record_tpt(uuid, uuid, text, date, date, text, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_tpt(p_id uuid, p_patient_id uuid, p_indication text, p_started_at date DEFAULT NULL::date, p_completed_at date DEFAULT NULL::date, p_regimen text DEFAULT NULL::text, p_completed boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO tb_preventive_treatment (
    id, clinic_id, patient_id, indication, started_at, completed_at, regimen, completed, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_indication, COALESCE(p_started_at, CURRENT_DATE),
    p_completed_at, p_regimen, COALESCE(p_completed, FALSE), p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    regimen = COALESCE(EXCLUDED.regimen, tb_preventive_treatment.regimen),
    completed = EXCLUDED.completed,
    notes = COALESCE(EXCLUDED.notes, tb_preventive_treatment.notes);

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_tpt', 'tb_preventive_treatment', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_record_viral_load(uuid, uuid, uuid, date, numeric, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_viral_load(p_id uuid, p_patient_id uuid, p_enrollment_id uuid DEFAULT NULL::uuid, p_test_date date DEFAULT NULL::date, p_result_copies numeric DEFAULT NULL::numeric, p_suppressed boolean DEFAULT NULL::boolean, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
  v_suppressed BOOLEAN;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  v_suppressed := COALESCE(
    p_suppressed,
    CASE WHEN p_result_copies IS NOT NULL THEN p_result_copies < 1000 ELSE NULL END
  );

  INSERT INTO viral_load_tests (
    id, clinic_id, patient_id, enrollment_id, test_date, result_copies, suppressed, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_enrollment_id, COALESCE(p_test_date, CURRENT_DATE),
    p_result_copies, v_suppressed, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_viral_load', 'viral_load_tests', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_reopen_lab(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_reopen_lab(p_visit_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  UPDATE visits
  SET
    lab_status = 'pending',
    lab_results = NULL,
    lab_abnormal = FALSE,
    lab_completed_at = NULL,
    lab_completed_by = NULL,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'reopen_lab', 'visits', p_visit_id);
END;
$$;


--
-- Name: rpc_request_draft_ai_assist(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_request_draft_ai_assist(p_visit_id uuid, p_sections_snapshot jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_doc_complete BOOLEAN;
BEGIN
  SELECT clinic_id, documentation_complete INTO v_clinic_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF v_doc_complete THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', FALSE, 'reason', 'signed');
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF count_unanswered_ai_notes(p_visit_id) >= 3 THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', FALSE, 'reason', 'cap');
  END IF;

  UPDATE visits
  SET ai_review_status = CASE
    WHEN ai_review_status IN ('completed', 'running') THEN ai_review_status
    ELSE 'pending'
  END,
  updated_at = NOW()
  WHERE id = p_visit_id;

  RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', TRUE);
END;
$$;


--
-- Name: rpc_request_lab_ai_assist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_request_lab_ai_assist(p_visit_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_doc_complete BOOLEAN;
BEGIN
  SELECT clinic_id, documentation_complete INTO v_clinic_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF v_doc_complete THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', FALSE, 'reason', 'signed');
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF count_unanswered_ai_notes(p_visit_id) >= 3 THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', FALSE, 'reason', 'cap');
  END IF;

  RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', TRUE);
END;
$$;


--
-- Name: rpc_search_patients(uuid, text, text, text, text, integer, integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_search_patients(p_clinic_id uuid, p_query text DEFAULT NULL::text, p_village text DEFAULT NULL::text, p_parish text DEFAULT NULL::text, p_national_id text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_sex text DEFAULT NULL::text, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, patient_id bigint, first_name text, last_name text, sex text, date_of_birth date, birth_year smallint, approximate_age smallint, dob_precision text, village text, parish text, guardian_name text, national_id text, whatsapp_number text, derived_age integer, match_score real, match_reasons text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
  WITH candidate AS (
    SELECT
      p.id, p.patient_id, p.first_name, p.last_name, p.sex,
      p.date_of_birth, p.birth_year, p.approximate_age, p.dob_precision,
      p.village, p.parish, p.guardian_name, p.national_id, p.whatsapp_number,
      patient_age_years(p.id) AS derived_age,
      CASE WHEN p_query IS NULL THEN 0::REAL
        ELSE GREATEST(
          similarity(COALESCE(p.first_name, ''), p_query),
          similarity(COALESCE(p.last_name, ''), p_query),
          similarity(COALESCE(trim(p.first_name || ' ' || p.last_name), ''), p_query)
        )::REAL
      END AS name_sim,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN p_query IS NOT NULL AND (
          p.first_name % p_query OR
          p.last_name % p_query OR
          p.first_name ILIKE '%' || p_query || '%' OR
          p.last_name ILIKE '%' || p_query || '%'
        ) THEN 'name_match' END,
        CASE WHEN p_village IS NOT NULL AND p.village ILIKE p_village THEN 'same_village' END,
        CASE WHEN p_parish IS NOT NULL AND p.parish ILIKE p_parish THEN 'same_parish' END,
        CASE WHEN p_national_id IS NOT NULL AND p.national_id = p_national_id THEN 'national_id_match' END,
        CASE WHEN p_age_min IS NOT NULL AND p_age_max IS NOT NULL
          AND patient_age_years(p.id) BETWEEN p_age_min AND p_age_max THEN 'age_match' END
      ], NULL) AS match_reasons_arr
    FROM patients p
    WHERE p.clinic_id = p_clinic_id
      AND (p_sex IS NULL OR p.sex = p_sex)
      AND (
        (p_query IS NOT NULL AND (
          p.first_name % p_query OR
          p.last_name % p_query OR
          p.first_name ILIKE '%' || p_query || '%' OR
          p.last_name ILIKE '%' || p_query || '%'
        ))
        OR (p_village IS NOT NULL AND p.village ILIKE p_village)
        OR (p_parish IS NOT NULL AND p.parish ILIKE p_parish)
        OR (p_national_id IS NOT NULL AND p.national_id = p_national_id)
      )
  )
  SELECT
    c.id, c.patient_id, c.first_name, c.last_name, c.sex,
    c.date_of_birth, c.birth_year, c.approximate_age, c.dob_precision,
    c.village, c.parish, c.guardian_name, c.national_id, c.whatsapp_number,
    c.derived_age,
    (c.name_sim
      + CASE WHEN 'same_village' = ANY(c.match_reasons_arr) THEN 0.5::REAL ELSE 0::REAL END
      + CASE WHEN 'same_parish' = ANY(c.match_reasons_arr) THEN 0.3::REAL ELSE 0::REAL END
      + CASE WHEN 'national_id_match' = ANY(c.match_reasons_arr) THEN 1.0::REAL ELSE 0::REAL END
      + CASE WHEN 'age_match' = ANY(c.match_reasons_arr) THEN 0.2::REAL ELSE 0::REAL END
    )::REAL AS match_score,
    c.match_reasons_arr AS match_reasons
  FROM candidate c
  WHERE array_length(c.match_reasons_arr, 1) > 0
  ORDER BY match_score DESC, c.last_name, c.first_name
  LIMIT p_limit;
END;
$$;


--
-- Name: rpc_send_pharmacy_back_to_clinician(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_send_pharmacy_back_to_clinician(p_visit_id uuid, p_reason text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_reason TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_reason := NULLIF(TRIM(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Reason required when sending back to clinician';
  END IF;

  UPDATE prescription_orders
  SET status = 'needs_clarification'
  WHERE visit_id = p_visit_id
    AND clinic_id = v_clinic_id
    AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock');

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = v_reason,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'send_pharmacy_back', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_send_pharmacy_line_back_to_clinician(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_send_pharmacy_line_back_to_clinician(p_visit_id uuid, p_prescription_order_id uuid, p_reason text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_reason TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_reason := NULLIF(TRIM(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Reason required when sending back to clinician';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE id = p_prescription_order_id
      AND visit_id = p_visit_id
      AND clinic_id = v_clinic_id
      AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
  ) THEN
    RAISE EXCEPTION 'Prescription line not found or cannot be sent back';
  END IF;

  UPDATE prescription_orders
  SET status = 'needs_clarification'
  WHERE id = p_prescription_order_id
    AND visit_id = p_visit_id
    AND clinic_id = v_clinic_id;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = v_reason,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'send_pharmacy_line_back', 'prescription_orders', p_prescription_order_id
  );
END;
$$;


--
-- Name: rpc_set_dispensing_status(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_set_dispensing_status(p_visit_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_status NOT IN ('not_started', 'in_progress', 'dispensed', 'partial', 'out_of_stock') THEN
    RAISE EXCEPTION 'Invalid dispensing status';
  END IF;

  UPDATE visits
  SET
    dispensing_status = p_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE NULL
    END,
    dispensed_by = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN get_current_staff_id()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'set_dispensing_status', 'visits', p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$;


--
-- Name: rpc_set_region_protocol(text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_set_region_protocol(p_protocol text, p_scope_type text, p_scope_value text, p_active boolean, p_note text DEFAULT NULL::text) RETURNS public.region_protocols
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_uid TEXT := auth.jwt()->>'sub';
  v_diocese TEXT;
  v_row region_protocols;
BEGIN
  IF p_scope_type NOT IN ('district', 'diocese') THEN
    RAISE EXCEPTION 'invalid scope_type: %', p_scope_type;
  END IF;

  -- Resolve the governing diocese for the authorization check.
  IF p_scope_type = 'diocese' THEN
    v_diocese := p_scope_value;
  ELSE
    SELECT diocese INTO v_diocese
    FROM clinics
    WHERE district = p_scope_value AND diocese IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_diocese IS NULL OR NOT is_diocese_coordinator(v_diocese) THEN
    RAISE EXCEPTION 'not authorized to manage protocol for % %',
      p_scope_type, p_scope_value;
  END IF;

  INSERT INTO region_protocols AS rp (
    protocol, scope_type, scope_value, active, note,
    activated_by, activated_at, updated_at
  )
  VALUES (
    p_protocol, p_scope_type, p_scope_value, p_active, p_note,
    v_uid, NOW(), NOW()
  )
  ON CONFLICT (protocol, scope_type, scope_value) DO UPDATE SET
    active = EXCLUDED.active,
    note = COALESCE(EXCLUDED.note, rp.note),
    updated_at = NOW(),
    activated_by = CASE WHEN EXCLUDED.active AND NOT rp.active
                        THEN v_uid ELSE rp.activated_by END,
    activated_at = CASE WHEN EXCLUDED.active AND NOT rp.active
                        THEN NOW() ELSE rp.activated_at END,
    deactivated_by = CASE WHEN NOT EXCLUDED.active AND rp.active
                          THEN v_uid ELSE rp.deactivated_by END,
    deactivated_at = CASE WHEN NOT EXCLUDED.active AND rp.active
                          THEN NOW() ELSE rp.deactivated_at END
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: rpc_sign_provider_note(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_sign_provider_note(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_role     TEXT;
  v_clinic   UUID;
  v_staff_id UUID;
  v_mid_level BOOLEAN;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can sign notes; role: %', v_role;
  END IF;

  v_mid_level := v_role IN ('nurse', 'nursing_assistant');

  UPDATE provider_notes
    SET status          = 'signed',
        finalized_at    = NOW(),
        finalized_by    = v_staff_id,
        requires_cosign = v_mid_level,
        updated_at      = NOW()
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;
END;
$$;


--
-- Name: rpc_start_consult(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_consult(p_visit_id uuid, p_redacted_snapshot jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
  v_staff_id UUID;
  v_thread_id UUID;
  v_doc_complete BOOLEAN;
  v_role TEXT;
BEGIN
  SELECT clinic_id, patient_id, documentation_complete
  INTO v_clinic_id, v_patient_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO consult_threads (visit_id, clinic_id, patient_id, created_by, redacted_snapshot)
  VALUES (p_visit_id, v_clinic_id, v_patient_id, v_staff_id, COALESCE(p_redacted_snapshot, '{}'::jsonb))
  ON CONFLICT (visit_id) DO UPDATE SET
    redacted_snapshot = EXCLUDED.redacted_snapshot,
    updated_at = NOW()
  RETURNING id INTO v_thread_id;

  RETURN jsonb_build_object(
    'thread_id', v_thread_id,
    'visit_id', p_visit_id,
    'read_only', v_doc_complete
  );
END;
$$;


--
-- Name: rpc_start_iv_infusion(uuid, uuid, text, smallint, text, smallint, smallint, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_iv_infusion(p_id uuid, p_admission_id uuid, p_fluid_type text, p_volume_ml smallint, p_additive text DEFAULT NULL::text, p_rate_ml_hr smallint DEFAULT NULL::smallint, p_drops_per_min smallint DEFAULT NULL::smallint, p_site_location text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF p_volume_ml IS NULL OR p_volume_ml <= 0 THEN
    RAISE EXCEPTION 'volume_ml required';
  END IF;

  INSERT INTO iv_infusions (
    id, admission_id, clinic_id, patient_id, fluid_type, additive,
    volume_ml, rate_ml_hr, drops_per_min, site_location, notes, started_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, p_fluid_type, p_additive,
    p_volume_ml, p_rate_ml_hr, p_drops_per_min, p_site_location, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_iv_infusion', 'iv_infusions', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_start_lab(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_lab(p_visit_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  UPDATE visits
  SET lab_status = 'running', updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id
    AND lab_status = 'pending';

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_lab', 'visits', p_visit_id);
END;
$$;


--
-- Name: rpc_start_lab_test(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_lab_test(p_visit_id uuid, p_test_name text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_tests_ordered TEXT;
  v_results JSONB;
  v_trimmed TEXT;
  v_i INT;
  v_elem JSONB;
  v_new_results JSONB := '[]'::jsonb;
  v_derived RECORD;
BEGIN
  v_trimmed := NULLIF(TRIM(p_test_name), '');
  IF v_trimmed IS NULL THEN RAISE EXCEPTION 'Test name cannot be empty'; END IF;

  SELECT clinic_id, tests_ordered, lab_test_results
  INTO v_clinic_id, v_tests_ordered, v_results
  FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_results := sync_lab_test_results_array(v_tests_ordered, v_results);

  FOR v_i IN 0..jsonb_array_length(v_results) - 1 LOOP
    v_elem := v_results->v_i;
    IF v_elem->>'test' = v_trimmed AND v_elem->>'status' = 'pending' THEN
      v_elem := v_elem || jsonb_build_object('status', 'running', 'started_at', NOW());
    END IF;
    v_new_results := v_new_results || jsonb_build_array(v_elem);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_new_results) AS e WHERE e->>'test' = v_trimmed
  ) THEN
    RAISE EXCEPTION 'Test not found on visit';
  END IF;

  SELECT * INTO v_derived FROM derive_visit_lab_state(v_new_results);

  UPDATE visits
  SET
    lab_test_results = v_new_results,
    lab_status = v_derived.lab_status,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_lab_test', 'visits', p_visit_id);
END;
$$;


--
-- Name: rpc_start_pharmacy_dispense(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_pharmacy_dispense(p_visit_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND pharmacy_order_submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Pharmacy order not submitted';
  END IF;

  UPDATE prescription_orders
  SET status = 'dispensing', ordered_at = ordered_at
  WHERE visit_id = p_visit_id
    AND status = 'ordered';

  UPDATE visits
  SET dispensing_status = 'in_progress', updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_pharmacy_dispense', 'visits', p_visit_id);
END;
$$;


--
-- Name: rpc_start_pregnancy(uuid, uuid, date, date, smallint, smallint, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_start_pregnancy(p_id uuid, p_patient_id uuid, p_lmp date DEFAULT NULL::date, p_edd date DEFAULT NULL::date, p_gravida smallint DEFAULT NULL::smallint, p_para smallint DEFAULT NULL::smallint, p_blood_group text DEFAULT NULL::text, p_hiv_status text DEFAULT NULL::text, p_syphilis_status text DEFAULT NULL::text, p_hepb_status text DEFAULT NULL::text, p_risk_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO pregnancies AS pg (
    id, clinic_id, patient_id, lmp, edd, gravida, para,
    blood_group, hiv_status, syphilis_status, hepb_status, risk_notes, created_by
  )
  VALUES (
    p_id, v_clinic_id, p_patient_id, p_lmp,
    COALESCE(p_edd, p_lmp + INTERVAL '280 days'), p_gravida, p_para,
    p_blood_group, p_hiv_status, p_syphilis_status, p_hepb_status, p_risk_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    lmp = EXCLUDED.lmp, edd = EXCLUDED.edd, gravida = EXCLUDED.gravida, para = EXCLUDED.para,
    blood_group = EXCLUDED.blood_group, hiv_status = EXCLUDED.hiv_status,
    syphilis_status = EXCLUDED.syphilis_status, hepb_status = EXCLUDED.hepb_status,
    risk_notes = EXCLUDED.risk_notes, updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_pregnancy', 'pregnancies', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_stop_iv_infusion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_stop_iv_infusion(p_infusion_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM iv_infusions WHERE id = p_infusion_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Infusion not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  UPDATE iv_infusions
  SET active = FALSE, stopped_at = COALESCE(stopped_at, NOW())
  WHERE id = p_infusion_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'stop_iv_infusion', 'iv_infusions', p_infusion_id);
  END IF;
  RETURN p_infusion_id;
END;
$$;


--
-- Name: rpc_stop_medication_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_stop_medication_order(p_order_id uuid, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM medication_orders WHERE id = p_order_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  UPDATE medication_orders SET active = FALSE, updated_at = NOW() WHERE id = p_order_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'stop_medication_order', 'medication_orders', p_order_id);
  END IF;
  RETURN p_order_id;
END;
$$;


--
-- Name: rpc_submit_lab_order(uuid, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_submit_lab_order(p_visit_id uuid, p_tests_ordered text, p_lab_status text DEFAULT 'pending'::text, p_lab_test_results jsonb DEFAULT NULL::jsonb, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  -- Replay gate before existence checks (101 convention): an already-applied
  -- op returns success regardless of current state.
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF p_lab_status NOT IN ('not_ordered', 'pending', 'running', 'done', 'abnormal') THEN
    RAISE EXCEPTION 'Invalid lab_status %', p_lab_status;
  END IF;

  UPDATE visits
  SET
    tests_ordered = p_tests_ordered,
    lab_status = p_lab_status,
    lab_test_results = COALESCE(p_lab_test_results, lab_test_results),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, v_clinic_id, 'submit_lab_order', 'visits', p_visit_id
    );
  END IF;
END;
$$;


--
-- Name: rpc_submit_pharmacy_order(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_submit_pharmacy_order(p_visit_id uuid, p_medications text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_meds TEXT;
  v_role TEXT;
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
  IF v_role NOT IN ('admin', 'doctor', 'nurse', 'clinical_officer', 'midwife') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  v_meds := NULLIF(TRIM(p_medications), '');
  IF v_meds IS NULL THEN
    RAISE EXCEPTION 'medications required to submit pharmacy order';
  END IF;

  UPDATE visits
  SET
    medications = v_meds,
    pharmacy_order_submitted_at = NOW(),
    pharmacy_order_submitted_by = COALESCE(get_current_staff_id(), pharmacy_order_submitted_by),
    dispensing_status = CASE
      WHEN dispensing_status IN ('dispensed') THEN dispensing_status
      ELSE 'not_started'
    END,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'submit_pharmacy_order', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_submit_pharmacy_order(uuid, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_submit_pharmacy_order(p_visit_id uuid, p_medications text, p_lines jsonb DEFAULT NULL::jsonb, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
  v_meds TEXT;
  v_role TEXT;
  v_line JSONB;
  v_idx INT := 0;
  v_has_lines BOOLEAN;
  v_summary TEXT;
  v_text_line TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin', 'doctor', 'nurse', 'clinical_officer', 'midwife') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  v_has_lines := p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' AND jsonb_array_length(p_lines) > 0;

  IF NOT v_has_lines THEN
    v_meds := NULLIF(TRIM(p_medications), '');
    IF v_meds IS NULL THEN
      RAISE EXCEPTION 'medications or structured lines required';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND dispensing_status IN ('dispensed')
  ) THEN
    RAISE EXCEPTION 'Cannot resubmit pharmacy order after full dispense';
  END IF;

  IF EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND clinic_id = v_clinic_id
      AND status = 'dispensing'
  ) THEN
    RAISE EXCEPTION 'Pharmacy is dispensing this order — send-back required before editing';
  END IF;

  DELETE FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status IN ('ordered', 'needs_clarification', 'dispensing');

  IF v_has_lines THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF NULLIF(TRIM(v_line->>'medication_code'), '') IS NULL
         AND NULLIF(TRIM(v_line->>'free_text_name'), '') IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO prescription_orders (
        visit_id, clinic_id, patient_id, sort_order,
        medication_code, free_text_name,
        dose_text, route_text, frequency_text, duration_text,
        quantity_prescribed, quantity_unit,
        status, source, ordered_by, notes
      ) VALUES (
        p_visit_id, v_clinic_id, v_patient_id, v_idx,
        NULLIF(TRIM(v_line->>'medication_code'), ''),
        NULLIF(TRIM(v_line->>'free_text_name'), ''),
        NULLIF(TRIM(v_line->>'dose_text'), ''),
        NULLIF(TRIM(v_line->>'route_text'), ''),
        NULLIF(TRIM(v_line->>'frequency_text'), ''),
        NULLIF(TRIM(v_line->>'duration_text'), ''),
        NULLIF(v_line->>'quantity_prescribed', '')::numeric,
        NULLIF(TRIM(v_line->>'quantity_unit'), ''),
        'ordered',
        COALESCE(NULLIF(TRIM(v_line->>'source'), ''), 'manual'),
        get_current_staff_id(),
        NULLIF(TRIM(v_line->>'notes'), '')
      );
      v_idx := v_idx + 1;
    END LOOP;

    IF v_idx = 0 THEN
      RAISE EXCEPTION 'At least one prescription line required';
    END IF;

    v_summary := rebuild_visit_medications_summary(p_visit_id);
  ELSE
    FOR v_text_line IN
      SELECT TRIM(line)
      FROM unnest(string_to_array(v_meds, E'\n')) AS line
      WHERE NULLIF(TRIM(line), '') IS NOT NULL
    LOOP
      INSERT INTO prescription_orders (
        visit_id, clinic_id, patient_id, sort_order,
        free_text_name, status, source, ordered_by
      ) VALUES (
        p_visit_id, v_clinic_id, v_patient_id, v_idx,
        v_text_line, 'ordered', 'legacy_text', get_current_staff_id()
      );
      v_idx := v_idx + 1;
    END LOOP;
    v_summary := v_meds;
  END IF;

  IF EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND status IN ('dispensed', 'partially_dispensed', 'out_of_stock')
  ) THEN
    v_agg_status := aggregate_visit_dispensing_status(p_visit_id);
  ELSE
    v_agg_status := 'not_started';
  END IF;

  UPDATE visits
  SET
    medications = v_summary,
    pharmacy_order_submitted_at = NOW(),
    pharmacy_order_submitted_by = COALESCE(get_current_staff_id(), pharmacy_order_submitted_by),
    dispensing_status = v_agg_status,
    dispense_notes = NULL,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'submit_pharmacy_order', 'visits', p_visit_id
  );
END;
$$;


--
-- Name: rpc_suggest_fefo_batch(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_suggest_fefo_batch(p_stock_item_id uuid, p_quantity numeric) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT b.id
  FROM pharmacy_stock_batches b
  WHERE b.stock_item_id = p_stock_item_id
    AND b.active
    AND b.quantity_on_hand >= p_quantity
  ORDER BY b.expires_at NULLS LAST, b.received_at ASC
  LIMIT 1;
$$;


--
-- Name: rpc_unfinalized_visits(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_unfinalized_visits(p_clinic_id uuid, p_from date, p_to date) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, patient_number bigint, visit_date date, doctor_id uuid, doctor_name text, status text, has_diagnosis boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_update_appointment(uuid, uuid, text, timestamp with time zone, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_update_appointment(p_clinic_id uuid, p_appointment_id uuid, p_event_type text, p_scheduled_at timestamp with time zone, p_patient_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_scheduled_end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_event_type NOT IN ('follow_up', 'drive', 'admin', 'external_lab_agency') THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  IF p_event_type = 'follow_up' AND p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Patient required for follow-up';
  END IF;

  IF p_event_type <> 'follow_up' AND NULLIF(TRIM(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Title required for clinic event';
  END IF;

  IF p_patient_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM patients
      WHERE id = p_patient_id AND clinic_id = p_clinic_id
    ) THEN
      RAISE EXCEPTION 'Patient not found';
    END IF;
  END IF;

  UPDATE appointments
  SET
    patient_id = CASE WHEN p_event_type = 'follow_up' THEN p_patient_id ELSE NULL END,
    event_type = p_event_type,
    title = CASE WHEN p_event_type = 'follow_up' THEN NULL ELSE NULLIF(TRIM(p_title), '') END,
    reason = NULLIF(TRIM(p_reason), ''),
    scheduled_at = p_scheduled_at,
    scheduled_end = p_scheduled_end,
    updated_at = NOW()
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
    AND status <> 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
END;
$$;


--
-- Name: rpc_update_patient_demographics(uuid, uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_update_patient_demographics(p_patient_id uuid, p_clinic_id uuid, p_first_name text, p_last_name text, p_village text DEFAULT NULL::text, p_parish text DEFAULT NULL::text, p_subcounty text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_guardian_name text DEFAULT NULL::text, p_guardian_relationship text DEFAULT NULL::text, p_whatsapp_number text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF NULLIF(TRIM(p_first_name), '') IS NULL OR NULLIF(TRIM(p_last_name), '') IS NULL THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  IF p_guardian_relationship IS NOT NULL
     AND TRIM(p_guardian_relationship) NOT IN (
       'mother', 'father', 'husband', 'wife', 'relative', 'neighbor'
     ) THEN
    RAISE EXCEPTION 'Invalid guardian_relationship';
  END IF;

  UPDATE patients
  SET
    first_name = NULLIF(TRIM(p_first_name), ''),
    last_name = NULLIF(TRIM(p_last_name), ''),
    village = NULLIF(TRIM(p_village), ''),
    parish = NULLIF(TRIM(p_parish), ''),
    subcounty = NULLIF(TRIM(p_subcounty), ''),
    district = NULLIF(TRIM(p_district), ''),
    guardian_name = NULLIF(TRIM(p_guardian_name), ''),
    guardian_relationship = NULLIF(TRIM(p_guardian_relationship), ''),
    whatsapp_number = NULLIF(TRIM(p_whatsapp_number), ''),
    updated_at = NOW()
  WHERE id = p_patient_id
    AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
END;
$$;


--
-- Name: rpc_upsert_critical_alert(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_critical_alert(p_visit_id uuid, p_rule_slug text, p_confirm_question text, p_clinical_prompt text, p_library_slug text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO visit_critical_alerts (
    visit_id, clinic_id, rule_slug, confirm_question, clinical_prompt, library_slug
  ) VALUES (
    p_visit_id, v_clinic_id, p_rule_slug, p_confirm_question, p_clinical_prompt, p_library_slug
  )
  ON CONFLICT (visit_id, rule_slug) DO UPDATE SET
    confirm_question = EXCLUDED.confirm_question,
    clinical_prompt = EXCLUDED.clinical_prompt,
    library_slug = EXCLUDED.library_slug
  WHERE visit_critical_alerts.clinician_response IS NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: rpc_upsert_hiv_care(uuid, uuid, date, text, smallint, date, text, text, boolean, boolean, boolean, boolean, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_hiv_care(p_id uuid, p_patient_id uuid, p_enrolled_at date DEFAULT NULL::date, p_care_status text DEFAULT 'pre_art'::text, p_who_stage smallint DEFAULT NULL::smallint, p_art_start_date date DEFAULT NULL::date, p_art_regimen text DEFAULT NULL::text, p_art_line text DEFAULT NULL::text, p_pregnant_at_enrollment boolean DEFAULT false, p_eligible_not_on_art boolean DEFAULT false, p_tb_assessed_last_visit boolean DEFAULT false, p_tb_treatment_started boolean DEFAULT false, p_cpt_at_last_visit boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO hiv_care_enrollments AS h (
    id, clinic_id, patient_id, enrolled_at, care_status, who_stage, art_start_date,
    art_regimen, art_line, pregnant_at_enrollment, eligible_not_on_art,
    tb_assessed_last_visit, tb_treatment_started, cpt_at_last_visit, notes, created_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, COALESCE(p_enrolled_at, CURRENT_DATE),
    COALESCE(p_care_status, 'pre_art'), p_who_stage, p_art_start_date,
    p_art_regimen, p_art_line, COALESCE(p_pregnant_at_enrollment, FALSE),
    COALESCE(p_eligible_not_on_art, FALSE), COALESCE(p_tb_assessed_last_visit, FALSE),
    COALESCE(p_tb_treatment_started, FALSE), COALESCE(p_cpt_at_last_visit, FALSE),
    p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    care_status = EXCLUDED.care_status,
    who_stage = COALESCE(EXCLUDED.who_stage, h.who_stage),
    art_start_date = COALESCE(EXCLUDED.art_start_date, h.art_start_date),
    art_regimen = COALESCE(EXCLUDED.art_regimen, h.art_regimen),
    art_line = COALESCE(EXCLUDED.art_line, h.art_line),
    pregnant_at_enrollment = EXCLUDED.pregnant_at_enrollment,
    eligible_not_on_art = EXCLUDED.eligible_not_on_art,
    tb_assessed_last_visit = EXCLUDED.tb_assessed_last_visit,
    tb_treatment_started = EXCLUDED.tb_treatment_started,
    cpt_at_last_visit = EXCLUDED.cpt_at_last_visit,
    notes = COALESCE(EXCLUDED.notes, h.notes),
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'upsert_hiv_care', 'hiv_care_enrollments', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_upsert_patient_note_summary(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_patient_note_summary(p_id uuid, p_visit_id uuid, p_content text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- (visit_id, source) is the conflict target. The clinician fallback row is
  -- created or updated; the AI row (if it exists) is untouched.
  INSERT INTO patient_notes (id, visit_id, content, language, source, status, created_at, updated_at)
  VALUES (p_id, p_visit_id, p_content, 'en', 'clinician_fallback', 'draft', NOW(), NOW())
  ON CONFLICT (visit_id, source) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = NOW();
END;
$$;


--
-- Name: rpc_upsert_pharmacy_batch_on_receive(uuid, uuid, numeric, text, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_pharmacy_batch_on_receive(p_stock_item_id uuid, p_clinic_id uuid, p_quantity numeric, p_batch_number text DEFAULT NULL::text, p_expires_at date DEFAULT NULL::date, p_supplier text DEFAULT NULL::text, p_gtin text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_staff_id UUID;
  v_batch_number TEXT;
  v_batch_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pharmacy_stock_items
    WHERE id = p_stock_item_id AND clinic_id = p_clinic_id AND active
  ) THEN
    RAISE EXCEPTION 'Invalid stock item';
  END IF;

  v_staff_id := get_current_staff_id();
  v_batch_number := NULLIF(TRIM(p_batch_number), '');

  IF v_batch_number IS NOT NULL THEN
    SELECT id INTO v_batch_id
    FROM pharmacy_stock_batches
    WHERE stock_item_id = p_stock_item_id
      AND batch_number = v_batch_number
    LIMIT 1;
  END IF;

  IF v_batch_id IS NULL THEN
    INSERT INTO pharmacy_stock_batches (
      stock_item_id,
      clinic_id,
      batch_number,
      expires_at,
      quantity_on_hand,
      supplier,
      gtin,
      active
    ) VALUES (
      p_stock_item_id,
      p_clinic_id,
      COALESCE(v_batch_number, 'recv-' || gen_random_uuid()::text),
      p_expires_at,
      0,
      p_supplier,
      p_gtin,
      TRUE
    )
    RETURNING id INTO v_batch_id;
  ELSE
    UPDATE pharmacy_stock_batches
    SET
      expires_at = COALESCE(p_expires_at, expires_at),
      supplier = COALESCE(p_supplier, supplier),
      gtin = COALESCE(p_gtin, gtin),
      active = TRUE
    WHERE id = v_batch_id;
  END IF;

  INSERT INTO pharmacy_stock_movements (
    stock_item_id,
    clinic_id,
    movement_type,
    quantity_delta,
    recorded_by,
    batch_number,
    expires_at,
    notes,
    batch_id
  ) VALUES (
    p_stock_item_id,
    p_clinic_id,
    'received',
    p_quantity,
    v_staff_id,
    v_batch_number,
    p_expires_at,
    p_notes,
    v_batch_id
  );

  RETURN v_batch_id;
END;
$$;


--
-- Name: rpc_upsert_provider_note(uuid, uuid, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_provider_note(p_id uuid, p_visit_id uuid, p_transcript text, p_status text DEFAULT 'draft'::text, p_patient_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_caller_clinic UUID;
  v_visit_clinic UUID;
  v_role TEXT;
  v_patient_id UUID;
  v_source TEXT;
  v_staff_id UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_staff_id := get_current_staff_id();
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_patient_id IS NOT NULL THEN
    v_patient_id := p_patient_id;
    SELECT clinic_id INTO v_visit_clinic FROM patients WHERE id = v_patient_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
    END IF;
    IF p_visit_id IS NOT NULL THEN
      SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
      IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
        RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
      END IF;
    END IF;
  ELSIF p_visit_id IS NOT NULL THEN
    SELECT clinic_id, patient_id INTO v_visit_clinic, v_patient_id FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Either p_patient_id or p_visit_id is required';
  END IF;

  v_source := COALESCE(p_source, CASE WHEN p_visit_id IS NOT NULL THEN 'visit' ELSE 'general' END);

  IF p_visit_id IS NOT NULL THEN
    INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, created_by, updated_at)
    VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, v_staff_id, now())
    ON CONFLICT (visit_id) WHERE visit_id IS NOT NULL DO UPDATE
      SET patient_id = EXCLUDED.patient_id,
          transcript = CASE
            WHEN EXCLUDED.transcript IS NOT NULL THEN EXCLUDED.transcript
            ELSE provider_notes.transcript
          END,
          status = EXCLUDED.status,
          source = COALESCE(EXCLUDED.source, provider_notes.source),
          updated_at = now();
    RETURN;
  END IF;

  INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, created_by, updated_at)
  VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, v_staff_id, now())
  ON CONFLICT (id) DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        visit_id = COALESCE(provider_notes.visit_id, EXCLUDED.visit_id),
        transcript = CASE
          WHEN EXCLUDED.transcript IS NOT NULL THEN EXCLUDED.transcript
          ELSE provider_notes.transcript
        END,
        status = EXCLUDED.status,
        source = COALESCE(EXCLUDED.source, provider_notes.source),
        updated_at = now();
END;
$$;


--
-- Name: rpc_upsert_tb_episode(uuid, uuid, text, date, text, text, text, text, boolean, boolean, date, text, text, text, date, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_tb_episode(p_id uuid, p_patient_id uuid, p_unit_tb_number text DEFAULT NULL::text, p_registered_at date DEFAULT NULL::date, p_case_type text DEFAULT 'new'::text, p_disease_class text DEFAULT 'pulmonary_smear_positive'::text, p_ept_site text DEFAULT NULL::text, p_hiv_status text DEFAULT NULL::text, p_on_art_at_diagnosis boolean DEFAULT false, p_on_cpt_at_diagnosis boolean DEFAULT false, p_treatment_started_at date DEFAULT NULL::date, p_regimen_category text DEFAULT NULL::text, p_treatment_phase text DEFAULT NULL::text, p_outcome text DEFAULT 'ongoing'::text, p_outcome_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_client_op_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO tb_episodes AS t (
    id, clinic_id, patient_id, unit_tb_number, registered_at, case_type, disease_class,
    ept_site, hiv_status, on_art_at_diagnosis, on_cpt_at_diagnosis, treatment_started_at,
    regimen_category, treatment_phase, outcome, outcome_date, notes, created_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_unit_tb_number, COALESCE(p_registered_at, CURRENT_DATE),
    COALESCE(p_case_type, 'new'), COALESCE(p_disease_class, 'pulmonary_smear_positive'),
    p_ept_site, p_hiv_status, COALESCE(p_on_art_at_diagnosis, FALSE),
    COALESCE(p_on_cpt_at_diagnosis, FALSE), p_treatment_started_at,
    p_regimen_category, p_treatment_phase, COALESCE(p_outcome, 'ongoing'),
    p_outcome_date, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    unit_tb_number = COALESCE(EXCLUDED.unit_tb_number, t.unit_tb_number),
    case_type = EXCLUDED.case_type,
    disease_class = EXCLUDED.disease_class,
    ept_site = COALESCE(EXCLUDED.ept_site, t.ept_site),
    hiv_status = COALESCE(EXCLUDED.hiv_status, t.hiv_status),
    on_art_at_diagnosis = EXCLUDED.on_art_at_diagnosis,
    on_cpt_at_diagnosis = EXCLUDED.on_cpt_at_diagnosis,
    treatment_started_at = COALESCE(EXCLUDED.treatment_started_at, t.treatment_started_at),
    regimen_category = COALESCE(EXCLUDED.regimen_category, t.regimen_category),
    treatment_phase = COALESCE(EXCLUDED.treatment_phase, t.treatment_phase),
    outcome = EXCLUDED.outcome,
    outcome_date = COALESCE(EXCLUDED.outcome_date, t.outcome_date),
    notes = COALESCE(EXCLUDED.notes, t.notes),
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'upsert_tb_episode', 'tb_episodes', p_id);
  END IF;
  RETURN p_id;
END;
$$;


--
-- Name: rpc_upsert_visit_clinical_summary(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_visit_clinical_summary(p_visit_id uuid, p_diagnosis text DEFAULT NULL::text, p_medications text DEFAULT NULL::text, p_follow_up_instructions text DEFAULT NULL::text, p_tests_ordered text DEFAULT NULL::text, p_structured_data text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
  v_structured_json JSONB;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_structured_data IS NOT NULL AND TRIM(p_structured_data) != '' THEN
    v_structured_json := p_structured_data::jsonb;
  END IF;

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
      updated_at = NOW()
  WHERE id = p_visit_id;

  UPDATE provider_notes
  SET structured_data = COALESCE(v_structured_json, structured_data),
      updated_at = NOW()
  WHERE visit_id = p_visit_id;
END;
$$;


--
-- Name: ebola_screenings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ebola_screenings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    temp_c numeric,
    epi_contact boolean DEFAULT false NOT NULL,
    unexplained_bleeding boolean DEFAULT false NOT NULL,
    symptoms text,
    is_suspect boolean DEFAULT false NOT NULL,
    action_taken text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rpc_visit_ebola_screening(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_visit_ebola_screening(p_visit_id uuid) RETURNS SETOF public.ebola_screenings
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT v.clinic_id INTO v_clinic_id FROM visits v WHERE v.id = p_visit_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM ebola_screenings WHERE visit_id = p_visit_id ORDER BY created_at DESC LIMIT 1;
END;
$$;


--
-- Name: rpc_void_charge(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_void_charge(p_charge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM charges WHERE id = p_charge_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  UPDATE charges SET voided = TRUE WHERE id = p_charge_id;
END;
$$;


--
-- Name: rpc_void_provider_note(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_void_provider_note(p_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_role TEXT;
  v_clinic UUID;
  v_staff_id UUID;
BEGIN
  v_clinic := get_current_clinic_id();
  v_role := get_current_staff_role();
  v_staff_id := get_current_staff_id();
  IF v_role NOT IN ('admin','doctor','clinical_officer') THEN
    RAISE EXCEPTION 'Only senior clinicians can void notes; role: %', v_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  -- v_clinic is NULL for service-role; the OR-NULL clause lets them through.
  UPDATE provider_notes
    SET status = 'voided',
        voided_at = now(),
        voided_by = v_staff_id,
        void_reason = p_reason,
        updated_at = now()
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;
END;
$$;


--
-- Name: rpc_worklist_all(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_all(p_clinic_id uuid, p_department text DEFAULT 'opd'::text, p_staff_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_staff_id UUID;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  IF v_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_staff_id FROM staff
    WHERE clerk_user_id = v_clerk_user_id
      AND clinic_id = p_clinic_id
      AND is_active = TRUE;
  ELSE
    IF p_staff_id IS NULL THEN
      RAISE EXCEPTION 'p_staff_id required for service-role caller';
    END IF;
    v_staff_id := p_staff_id;
  END IF;

  RETURN jsonb_build_object(
    'needs_vitals', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.queue_status,
          v.checked_in_at
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.department = p_department
          AND v.visit_date = kampala_today()
          AND v.queue_status IN ('waiting', 'with_nurse')
          AND NOT EXISTS (
            SELECT 1 FROM patient_vitals pv WHERE pv.visit_id = v.id
          )
        ORDER BY v.checked_in_at
      ) r
    ), '[]'::jsonb),

    'needs_clinician', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
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
          AND v.visit_date = kampala_today()
          AND v.queue_status IN ('ready_for_doctor', 'with_doctor')
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY
          CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
          v.queue_position NULLS LAST
      ) r
    ), '[]'::jsonb),

    'needs_lab', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.lab_status,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.visit_date >= kampala_today() - INTERVAL '7 days'
          AND v.tests_ordered IS NOT NULL
          AND TRIM(v.tests_ordered) <> ''
          AND v.lab_status IN ('pending', 'running')
      ) r
    ), '[]'::jsonb),

    'needs_pharmacy', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.medications,
          v.dispensing_status,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.medications IS NOT NULL
          AND TRIM(v.medications) <> ''
          AND v.pharmacy_order_submitted_at IS NOT NULL
          AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
        ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'pharmacy_returned', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.medications,
          v.dispense_notes,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.dispensing_status = 'returned'
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY v.updated_at DESC, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'results_ready', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.lab_status,
          v.lab_results,
          COALESCE(v.lab_abnormal, FALSE) AS lab_abnormal,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.lab_status IN ('done', 'abnormal')
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY v.lab_completed_at DESC NULLS LAST, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'needs_payment', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
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
        ORDER BY v.visit_date DESC, v.documentation_completed_at NULLS LAST
      ) r
    ), '[]'::jsonb),

    'my_drafts', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
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
          AND pn.created_by = v_staff_id
        ORDER BY pn.updated_at DESC
      ) r
    ), '[]'::jsonb),

    'care_tasks', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          ct.id AS task_id,
          ct.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          ct.visit_id,
          ct.task_type,
          ct.title,
          ct.description,
          ct.assignee_role,
          ct.assignee_id,
          ct.due_at,
          ct.status,
          ct.created_at
        FROM care_tasks ct
        JOIN patients p ON p.id = ct.patient_id
        WHERE ct.clinic_id = p_clinic_id
          AND ct.status IN ('open', 'in_progress')
        ORDER BY ct.due_at NULLS LAST, ct.created_at
      ) r
    ), '[]'::jsonb)
  );
END;
$$;


--
-- Name: rpc_worklist_care_tasks(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_care_tasks(p_clinic_id uuid, p_assignee_role text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_task_type text DEFAULT NULL::text) RETURNS TABLE(task_id uuid, patient_id uuid, patient_name text, visit_id uuid, task_type text, title text, description text, assignee_role text, assignee_id uuid, due_at timestamp with time zone, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


--
-- Name: rpc_worklist_my_drafts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_my_drafts(p_clinic_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS TABLE(note_id uuid, patient_id uuid, patient_name text, visit_id uuid, source text, transcript_preview text, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
    AND pn.created_by = v_staff_id
  ORDER BY pn.updated_at DESC;
END;
$$;


--
-- Name: rpc_worklist_needs_clinician(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_needs_clinician(p_clinic_id uuid, p_department text DEFAULT 'opd'::text) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, chief_complaint text, queue_status text, priority text, doctor_id uuid, checked_in_at timestamp with time zone, wait_minutes integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ) AS derived_age,
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
    AND v.visit_date = kampala_today()
    AND v.queue_status IN ('ready_for_doctor', 'with_doctor')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY
    CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
    v.queue_position NULLS LAST;
END;
$$;


--
-- Name: rpc_worklist_needs_lab(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_needs_lab(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, chief_complaint text, lab_status text, doctor_id uuid, visit_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.chief_complaint,
    v.lab_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date >= kampala_today() - INTERVAL '7 days'
    AND v.tests_ordered IS NOT NULL
    AND TRIM(v.tests_ordered) <> ''
    AND v.lab_status IN ('pending', 'running');
END;
$$;


--
-- Name: rpc_worklist_needs_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_needs_payment(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, diagnosis text, visit_date date, documentation_completed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
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
$$;


--
-- Name: rpc_worklist_needs_pharmacy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_needs_pharmacy(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, medications text, dispensing_status text, doctor_id uuid, visit_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.medications,
    v.dispensing_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.medications IS NOT NULL
    AND TRIM(v.medications) <> ''
    AND v.pharmacy_order_submitted_at IS NOT NULL
    AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC;
END;
$$;


--
-- Name: rpc_worklist_needs_vitals(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_needs_vitals(p_clinic_id uuid, p_department text DEFAULT 'opd'::text) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, chief_complaint text, queue_status text, checked_in_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
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
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ) AS derived_age,
    v.chief_complaint,
    v.queue_status,
    v.checked_in_at
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = kampala_today()
    AND v.queue_status IN ('waiting', 'with_nurse')
    AND NOT EXISTS (
      SELECT 1 FROM patient_vitals pv
      WHERE pv.visit_id = v.id
    )
  ORDER BY v.checked_in_at;
END;
$$;


--
-- Name: rpc_worklist_pharmacy_returned(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_pharmacy_returned(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, medications text, dispense_notes text, doctor_id uuid, visit_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.medications,
    v.dispense_notes,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.dispensing_status = 'returned'
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.updated_at DESC, v.visit_date DESC;
END;
$$;


--
-- Name: rpc_worklist_results_ready(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_worklist_results_ready(p_clinic_id uuid) RETURNS TABLE(visit_id uuid, patient_id uuid, patient_name text, sex text, derived_age integer, chief_complaint text, lab_status text, lab_results text, lab_abnormal boolean, doctor_id uuid, visit_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.chief_complaint,
    v.lab_status,
    v.lab_results,
    COALESCE(v.lab_abnormal, FALSE),
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.lab_status IN ('done', 'abnormal')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.lab_completed_at DESC NULLS LAST, v.visit_date DESC;
END;
$$;


--
-- Name: set_updated_at_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: start_visit_self_triage(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_visit_self_triage(p_visit_id uuid, p_clinician_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_clinician_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as lead clinician for this clinic';
  END IF;

  UPDATE visits
  SET
    doctor_id = p_clinician_id,
    nurse_id = COALESCE(nurse_id, p_clinician_id),
    queue_status = 'with_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in waiting status (cannot self-triage)';
  END IF;
END;
$$;


--
-- Name: sync_lab_test_results_array(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_lab_test_results_array(p_tests_ordered text, p_existing jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_names TEXT[];
  v_name TEXT;
  v_out JSONB := '[]'::jsonb;
  v_existing JSONB;
  v_match JSONB;
BEGIN
  v_names := parse_tests_ordered(p_tests_ordered);
  FOREACH v_name IN ARRAY v_names LOOP
    SELECT elem INTO v_match
    FROM jsonb_array_elements(COALESCE(p_existing, '[]'::jsonb)) AS elem
    WHERE elem->>'test' = v_name
    LIMIT 1;

    IF v_match IS NULL THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'test', v_name,
        'status', 'pending',
        'result', NULL,
        'abnormal', false,
        'started_at', NULL,
        'completed_at', NULL
      ));
    ELSE
      v_out := v_out || jsonb_build_array(v_match);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;


--
-- Name: sync_op_already_applied(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_op_already_applied(p_client_op_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF p_client_op_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (SELECT 1 FROM sync_operations WHERE id = p_client_op_id);
END;
$$;


--
-- Name: sync_op_record(uuid, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_op_record(p_client_op_id uuid, p_clinic_id uuid, p_operation_type text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF p_client_op_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO sync_operations (
    id, clinic_id, staff_id, operation_type, entity_type, entity_id
  ) VALUES (
    p_client_op_id,
    p_clinic_id,
    get_current_staff_id(),
    p_operation_type,
    p_entity_type,
    p_entity_id
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;


--
-- Name: sync_patient_display_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_patient_display_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.display_name := trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  IF NEW.display_name = '' THEN
    NEW.display_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: uganda_fy_quarter_bounds(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uganda_fy_quarter_bounds(p_fy_start_year integer, p_quarter integer) RETURNS TABLE(period_start date, period_end date)
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_quarter NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Quarter must be 1-4';
  END IF;
  period_start := CASE p_quarter
    WHEN 1 THEN make_date(p_fy_start_year, 7, 1)
    WHEN 2 THEN make_date(p_fy_start_year, 10, 1)
    WHEN 3 THEN make_date(p_fy_start_year + 1, 1, 1)
    WHEN 4 THEN make_date(p_fy_start_year + 1, 4, 1)
  END;
  period_end := CASE p_quarter
    WHEN 1 THEN make_date(p_fy_start_year, 10, 1)
    WHEN 2 THEN make_date(p_fy_start_year + 1, 1, 1)
    WHEN 3 THEN make_date(p_fy_start_year + 1, 4, 1)
    WHEN 4 THEN make_date(p_fy_start_year + 1, 7, 1)
  END;
  RETURN NEXT;
END;
$$;


--
-- Name: update_care_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_care_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: visit_has_open_lab_tests(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visit_has_open_lab_tests(p_results jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_results, '[]'::jsonb)) AS elem
    WHERE elem->>'status' IN ('pending', 'running')
  );
$$;


--
-- Name: admission_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admission_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    note text NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    admitted_at timestamp with time zone DEFAULT now() NOT NULL,
    discharged_at timestamp with time zone,
    ward_label text,
    chief_complaint text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ward text DEFAULT 'general'::text NOT NULL,
    bed_label text,
    admission_type text,
    weight_kg numeric,
    provisional_dx text,
    gravida smallint,
    para smallint,
    edd date,
    gestation_weeks smallint,
    hiv_status text,
    presenting_status text,
    outcome text,
    disposition text,
    discharge_notes text,
    discharged_by uuid,
    CONSTRAINT admissions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'discharged'::text, 'transferred'::text]))),
    CONSTRAINT admissions_ward_check CHECK ((ward = ANY (ARRAY['general'::text, 'maternity'::text])))
);


--
-- Name: ai_review_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_review_suggestions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    visit_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    suggestion_type text NOT NULL,
    question text NOT NULL,
    reasoning text NOT NULL,
    citation_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    confidence text NOT NULL,
    clinician_response text,
    responded_at timestamp with time zone,
    responded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phase text DEFAULT 'post_sign'::text NOT NULL,
    display_tier text DEFAULT 'timeline'::text NOT NULL,
    CONSTRAINT ai_review_suggestions_clinician_response_check CHECK (((clinician_response IS NULL) OR (clinician_response = ANY (ARRAY['considered_proceeded'::text, 'reopened_note'::text, 'dismissed'::text])))),
    CONSTRAINT ai_review_suggestions_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT ai_review_suggestions_display_tier_check CHECK ((display_tier = ANY (ARRAY['timeline'::text, 'interruptive'::text]))),
    CONSTRAINT ai_review_suggestions_phase_check CHECK ((phase = ANY (ARRAY['draft'::text, 'pre_sign'::text, 'post_sign'::text, 'lab'::text])))
);


--
-- Name: TABLE ai_review_suggestions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_review_suggestions IS 'Audit log of every AI disagreement question + clinician response. Drives the AI-quality admin report. The clinician is always the authority — these are questions, not verdicts.';


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid,
    event_type text DEFAULT 'follow_up'::text NOT NULL,
    title text,
    reason text,
    scheduled_at timestamp with time zone NOT NULL,
    scheduled_end timestamp with time zone,
    unit text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_event_type_check CHECK ((event_type = ANY (ARRAY['follow_up'::text, 'drive'::text, 'admin'::text, 'external_lab_agency'::text]))),
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    actor_id uuid,
    actor_type text NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now(),
    patient_id uuid,
    actor_clerk_id text,
    actor_role text,
    CONSTRAINT audit_logs_actor_type_check CHECK ((actor_type = ANY (ARRAY['staff'::text, 'patient'::text, 'system'::text])))
);


--
-- Name: care_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    task_type text NOT NULL,
    title text NOT NULL,
    description text,
    assignee_role text,
    assignee_id uuid,
    created_by uuid NOT NULL,
    due_at timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT care_tasks_assignee_role_check CHECK (((assignee_role IS NULL) OR (assignee_role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'clinical_officer'::text, 'midwife'::text, 'nursing_assistant'::text, 'records_officer'::text, 'lab_tech'::text, 'dispenser'::text])))),
    CONSTRAINT care_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT care_tasks_task_type_check CHECK ((task_type = ANY (ARRAY['lab_followup'::text, 'phone_callback'::text, 'home_visit'::text, 'medication_review'::text, 'referral_followup'::text, 'general'::text])))
);


--
-- Name: charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    description text NOT NULL,
    category text,
    amount_ugx integer NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    voided boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price_ugx integer,
    item_code text,
    manually_adjusted boolean DEFAULT false NOT NULL,
    CONSTRAINT charges_amount_ugx_check CHECK ((amount_ugx >= 0))
);


--
-- Name: chart_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    surface text NOT NULL,
    accessed_on date DEFAULT public.kampala_today() NOT NULL,
    first_at timestamp with time zone DEFAULT now() NOT NULL,
    last_at timestamp with time zone DEFAULT now() NOT NULL,
    access_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT chart_access_log_access_count_check CHECK ((access_count >= 1))
);


--
-- Name: clinic_billing_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_billing_rates (
    clinic_id uuid NOT NULL,
    consultation_fee_ugx integer DEFAULT 5000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pharmacy_markup_percent integer DEFAULT 10 NOT NULL,
    CONSTRAINT clinic_billing_rates_consultation_fee_ugx_check CHECK ((consultation_fee_ugx >= 0)),
    CONSTRAINT clinic_billing_rates_pharmacy_markup_percent_check CHECK (((pharmacy_markup_percent >= 0) AND (pharmacy_markup_percent <= 200)))
);


--
-- Name: COLUMN clinic_billing_rates.pharmacy_markup_percent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinic_billing_rates.pharmacy_markup_percent IS 'Percent added to pharmacy stock unit_price_ugx when raising patient charges.';


--
-- Name: clinic_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_departments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clinic_id uuid NOT NULL,
    department text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clinic_departments_department_check CHECK ((department = ANY (ARRAY['opd'::text, 'anc'::text, 'maternity'::text, 'family_planning'::text, 'immunization'::text])))
);


--
-- Name: clinic_lab_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_lab_capabilities (
    clinic_id uuid NOT NULL,
    test_name text NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    notes text,
    last_updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    category text,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: clinic_pharmacy_formulary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_pharmacy_formulary (
    clinic_id uuid NOT NULL,
    drug_name text NOT NULL,
    in_stock boolean DEFAULT true NOT NULL,
    notes text,
    last_updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    category text,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    medication_code text
);


--
-- Name: clinic_print_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_print_settings (
    clinic_id uuid NOT NULL,
    paper_width_mm smallint DEFAULT 58 NOT NULL,
    cut_feed_mm smallint DEFAULT 14 NOT NULL,
    auto_print boolean DEFAULT true NOT NULL,
    setup_completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clinic_print_settings_cut_feed_mm_check CHECK (((cut_feed_mm >= 8) AND (cut_feed_mm <= 24))),
    CONSTRAINT clinic_print_settings_paper_width_mm_check CHECK ((paper_width_mm = ANY (ARRAY[58, 80])))
);


--
-- Name: TABLE clinic_print_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.clinic_print_settings IS 'Thermal receipt layout per clinic. Visit, billing, and pharmacy print routes read these values.';


--
-- Name: COLUMN clinic_print_settings.paper_width_mm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinic_print_settings.paper_width_mm IS 'Thermal roll width: 58mm (32 cols) or 80mm (48 cols).';


--
-- Name: COLUMN clinic_print_settings.cut_feed_mm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinic_print_settings.cut_feed_mm IS 'Blank feed before auto-cut (mm). Increase if cutter lands through footer text.';


--
-- Name: COLUMN clinic_print_settings.auto_print; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinic_print_settings.auto_print IS 'When true, receipt pages open the browser print dialog automatically.';


--
-- Name: COLUMN clinic_print_settings.setup_completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinic_print_settings.setup_completed_at IS 'Set when admin finishes printer setup wizard.';


--
-- Name: clinic_protocol_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_protocol_enrollments (
    clinic_id uuid NOT NULL,
    protocol_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: clinical_protocol_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_protocol_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    trigger_hint text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    lab_bundle jsonb,
    isolation_required boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clinics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinics (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    timezone text DEFAULT 'Africa/Kampala'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    clerk_organization_id text,
    receipt_prefix character varying(5),
    phone text,
    umdpc_number text,
    diocese text,
    district text,
    subcounty text,
    parish text,
    village text,
    level text,
    workflow_config jsonb DEFAULT '{"default_opd_filters": ["waiting", "needs_vitals", "with_clinician", "awaiting_labs", "at_pharmacy", "done_today"], "prominent_departments": ["opd", "anc", "maternity"], "enabled_protocol_slugs": [], "show_physical_queue_filter": true}'::jsonb NOT NULL
);


--
-- Name: COLUMN clinics.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinics.phone IS 'Clinic contact phone for patient follow-up. Printed on thermal receipts.';


--
-- Name: COLUMN clinics.umdpc_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clinics.umdpc_number IS 'Uganda Medical and Dental Practitioners Council registration number. Printed on thermal receipts to establish official status.';


--
-- Name: cme_flashcards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cme_flashcards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    front_text text NOT NULL,
    back_text text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: cme_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cme_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    body_markdown text NOT NULL,
    library_slug text,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: cme_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cme_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    display_order integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cme_quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cme_quiz_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    score_pct integer NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cme_quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cme_quiz_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid NOT NULL,
    prompt text NOT NULL,
    choices jsonb NOT NULL,
    correct_index integer NOT NULL,
    explanation text,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: consult_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consult_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consult_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: consult_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consult_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    created_by uuid NOT NULL,
    redacted_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consult_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: diocese_coordinators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diocese_coordinators (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clerk_user_id text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    diocese text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dispense_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispense_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prescription_order_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    dispensed_by uuid NOT NULL,
    quantity_dispensed numeric(10,2),
    quantity_unit text,
    line_status text NOT NULL,
    substitute_medication_code text,
    stock_item_id uuid,
    stock_movement_id uuid,
    notes text,
    dispensed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dispense_records_line_status_check CHECK ((line_status = ANY (ARRAY['dispensed'::text, 'partially_dispensed'::text, 'out_of_stock'::text])))
);


--
-- Name: hiv_care_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hiv_care_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    enrolled_at date DEFAULT CURRENT_DATE NOT NULL,
    care_status text DEFAULT 'pre_art'::text NOT NULL,
    who_stage smallint,
    art_start_date date,
    art_regimen text,
    art_line text,
    pregnant_at_enrollment boolean DEFAULT false NOT NULL,
    eligible_not_on_art boolean DEFAULT false NOT NULL,
    tb_assessed_last_visit boolean DEFAULT false NOT NULL,
    tb_treatment_started boolean DEFAULT false NOT NULL,
    cpt_at_last_visit boolean DEFAULT false NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hiv_care_enrollments_art_line_check CHECK ((art_line = ANY (ARRAY['first'::text, 'second'::text]))),
    CONSTRAINT hiv_care_enrollments_care_status_check CHECK ((care_status = ANY (ARRAY['pre_art'::text, 'on_art'::text, 'transferred_out'::text, 'ltfu'::text, 'dead'::text, 'closed'::text]))),
    CONSTRAINT hiv_care_enrollments_who_stage_check CHECK (((who_stage >= 1) AND (who_stage <= 4)))
);


--
-- Name: hmis_106a_elements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hmis_106a_elements (
    id integer NOT NULL,
    element_code text NOT NULL,
    report text NOT NULL,
    section text NOT NULL,
    display_name text NOT NULL,
    dhis2_hint text,
    sort_order integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT hmis_106a_elements_report_check CHECK ((report = ANY (ARRAY['hiv'::text, 'tb'::text])))
);


--
-- Name: hmis_106a_elements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hmis_106a_elements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hmis_106a_elements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hmis_106a_elements_id_seq OWNED BY public.hmis_106a_elements.id;


--
-- Name: hmis_diagnosis_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hmis_diagnosis_codes (
    id integer NOT NULL,
    hmis_code text NOT NULL,
    category text NOT NULL,
    subcategory text,
    display_name text NOT NULL,
    icd10_codes text[],
    sort_order integer NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: hmis_diagnosis_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hmis_diagnosis_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hmis_diagnosis_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hmis_diagnosis_codes_id_seq OWNED BY public.hmis_diagnosis_codes.id;


--
-- Name: hts_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hts_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    event_date date DEFAULT CURRENT_DATE NOT NULL,
    counseled boolean DEFAULT true NOT NULL,
    tested boolean DEFAULT false NOT NULL,
    result text,
    result_received boolean DEFAULT false NOT NULL,
    first_result_in_fy boolean DEFAULT false NOT NULL,
    suspected_tb boolean DEFAULT false NOT NULL,
    started_cpt boolean DEFAULT false NOT NULL,
    retester boolean DEFAULT false NOT NULL,
    couple_test boolean DEFAULT false NOT NULL,
    couple_concordant boolean,
    pep boolean DEFAULT false NOT NULL,
    smc_provided boolean DEFAULT false NOT NULL,
    pregnancy_id uuid,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hts_events_result_check CHECK ((result = ANY (ARRAY['negative'::text, 'positive'::text, 'indeterminate'::text, 'not_tested'::text])))
);


--
-- Name: lab_stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_stock_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    test_code text,
    test_name text NOT NULL,
    category text NOT NULL,
    unit text NOT NULL,
    quantity_on_hand numeric(12,3) DEFAULT 0 NOT NULL,
    low_stock_threshold numeric(12,3) DEFAULT 5,
    expires_at date,
    batch_number text,
    supplier text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_unavailable boolean DEFAULT false NOT NULL,
    unit_price_ugx integer,
    CONSTRAINT lab_stock_items_category_check CHECK ((category = ANY (ARRAY['rdt_kit'::text, 'reagent'::text, 'consumable'::text, 'slide_stain'::text, 'other'::text])))
);


--
-- Name: COLUMN lab_stock_items.is_unavailable; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lab_stock_items.is_unavailable IS 'Staff-set: test/reagent currently unobtainable regardless of on-hand count.';


--
-- Name: COLUMN lab_stock_items.unit_price_ugx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lab_stock_items.unit_price_ugx IS 'Sale price per unit in UGX; null when subsidised or unknown.';


--
-- Name: lab_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_delta numeric(12,3) NOT NULL,
    visit_id uuid,
    recorded_by uuid,
    batch_number text,
    expires_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['received'::text, 'consumed'::text, 'adjusted'::text, 'expired'::text, 'transferred_in'::text, 'transferred_out'::text])))
);


--
-- Name: lab_test_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_test_catalog (
    code text NOT NULL,
    test_name text NOT NULL,
    category text,
    specimen text,
    result_unit text,
    active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_price_ugx integer DEFAULT 0 NOT NULL
);


--
-- Name: medical_corpus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_corpus (
    id bigint NOT NULL,
    document_id bigint NOT NULL,
    section text,
    section_anchor text,
    chunk_index integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medical_corpus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medical_corpus_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medical_corpus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medical_corpus_id_seq OWNED BY public.medical_corpus.id;


--
-- Name: medical_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_documents (
    id bigint NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    topic text NOT NULL,
    jurisdiction text DEFAULT 'uganda'::text NOT NULL,
    source_org text,
    source_year integer,
    source_url text,
    summary text,
    reviewers text[] DEFAULT '{}'::text[] NOT NULL,
    last_reviewed_at date,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medical_documents_topic_check CHECK ((topic = ANY (ARRAY['malaria'::text, 'hiv_tb'::text, 'maternal_anc'::text, 'child_health'::text, 'ncd'::text, 'mental_health'::text, 'emergency'::text, 'imci'::text, 'pharmacology'::text, 'guidelines_general'::text])))
);


--
-- Name: TABLE medical_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.medical_documents IS 'Public evidence library — Uganda HC III treatment guidelines, WHO IMCI, national protocols. The /library page on the Karibu site renders directly from this table; AI citations link back to the exact chunk via section_anchor.';


--
-- Name: COLUMN medical_documents.reviewers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medical_documents.reviewers IS 'Names of medical reviewers shown on the /library page for credibility. Must include at least one Uganda-licensed clinician before the document is published.';


--
-- Name: COLUMN medical_documents.is_published; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medical_documents.is_published IS 'Gate before public visibility. New documents land unpublished; reviewer flips to true after editorial check.';


--
-- Name: medical_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medical_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medical_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medical_documents_id_seq OWNED BY public.medical_documents.id;


--
-- Name: medication_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_catalog (
    code text NOT NULL,
    generic_name text NOT NULL,
    strength text,
    formulation text,
    unit text,
    category text,
    active boolean DEFAULT true NOT NULL,
    default_price_ugx integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    strengths text[] DEFAULT '{}'::text[] NOT NULL,
    default_frequency text,
    default_route text DEFAULT 'PO'::text,
    warning_text text,
    display_order integer DEFAULT 100 NOT NULL
);


--
-- Name: message_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid,
    visit_id uuid,
    direction text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    message_type text,
    content_summary text,
    external_id text,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT message_logs_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text]))),
    CONSTRAINT message_logs_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: patient_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_id_seq
    START WITH 100001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    visit_id uuid NOT NULL,
    content text,
    language text DEFAULT 'en'::text,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source text DEFAULT 'ai_generated'::text NOT NULL,
    CONSTRAINT patient_notes_source_check CHECK ((source = ANY (ARRAY['ai_generated'::text, 'clinician_fallback'::text]))),
    CONSTRAINT patient_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text])))
);


--
-- Name: patient_number_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_number_sequences (
    clinic_id uuid NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: patient_vitals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_vitals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_by uuid,
    weight_kg numeric(5,2),
    height_cm numeric(5,1),
    temp_c numeric(3,1),
    bp_systolic integer,
    bp_diastolic integer,
    pulse_bpm integer,
    resp_rate integer,
    spo2_pct integer,
    muac_cm numeric(4,1),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clinic_id uuid NOT NULL,
    whatsapp_number text,
    display_name text,
    date_of_birth date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sex text,
    patient_number text,
    first_name text,
    last_name text,
    patient_id bigint DEFAULT nextval('public.patient_id_seq'::regclass),
    birth_year smallint,
    approximate_age smallint,
    age_recorded_at timestamp with time zone,
    dob_precision text DEFAULT 'unknown'::text NOT NULL,
    village text,
    parish text,
    subcounty text,
    district text,
    guardian_name text,
    national_id text,
    guardian_relationship text,
    CONSTRAINT patients_approximate_age_check CHECK (((approximate_age IS NULL) OR ((approximate_age >= 0) AND (approximate_age <= 130)))),
    CONSTRAINT patients_birth_year_check CHECK (((birth_year IS NULL) OR ((birth_year >= 1900) AND ((birth_year)::numeric <= EXTRACT(year FROM CURRENT_DATE))))),
    CONSTRAINT patients_dob_precision_check CHECK ((dob_precision = ANY (ARRAY['exact'::text, 'year_only'::text, 'age_estimate'::text, 'unknown'::text]))),
    CONSTRAINT patients_dob_precision_consistent CHECK ((((dob_precision = 'exact'::text) AND (date_of_birth IS NOT NULL)) OR ((dob_precision = 'year_only'::text) AND (birth_year IS NOT NULL)) OR ((dob_precision = 'age_estimate'::text) AND (approximate_age IS NOT NULL) AND (age_recorded_at IS NOT NULL)) OR (dob_precision = 'unknown'::text))),
    CONSTRAINT patients_guardian_relationship_check CHECK (((guardian_relationship IS NULL) OR (guardian_relationship = ANY (ARRAY['mother'::text, 'father'::text, 'husband'::text, 'wife'::text, 'relative'::text, 'neighbor'::text])))),
    CONSTRAINT patients_sex_check CHECK ((sex = ANY (ARRAY['M'::text, 'F'::text])))
);


--
-- Name: payment_receipt_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_receipt_sequences (
    clinic_id uuid NOT NULL,
    sequence_date date NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    visit_id uuid,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    amount_ugx integer NOT NULL,
    payment_method text NOT NULL,
    status text DEFAULT 'paid'::text NOT NULL,
    receipt_number text,
    service_type text,
    notes text,
    collected_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    amount_barter_ugx integer DEFAULT 0 NOT NULL,
    barter_description text,
    CONSTRAINT payments_amount_barter_ugx_check CHECK ((amount_barter_ugx >= 0)),
    CONSTRAINT payments_amount_ugx_check CHECK ((amount_ugx >= 0)),
    CONSTRAINT payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'mtn_momo'::text, 'airtel_money'::text, 'barter'::text, 'mixed'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'pending'::text, 'failed'::text, 'waived'::text])))
);


--
-- Name: pharmacy_stock_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_stock_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    batch_number text,
    expires_at date,
    quantity_on_hand numeric(12,3) DEFAULT 0 NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier text,
    active boolean DEFAULT true NOT NULL,
    gtin text,
    CONSTRAINT pharmacy_stock_batches_quantity_on_hand_check CHECK ((quantity_on_hand >= (0)::numeric))
);


--
-- Name: pharmacy_stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_stock_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    drug_code text NOT NULL,
    drug_name text NOT NULL,
    formulation text NOT NULL,
    strength text,
    unit text NOT NULL,
    quantity_on_hand numeric(12,3) DEFAULT 0 NOT NULL,
    low_stock_threshold numeric(12,3) DEFAULT 10,
    unit_price_ugx integer,
    expires_at date,
    batch_number text,
    supplier text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_unavailable boolean DEFAULT false NOT NULL,
    CONSTRAINT pharmacy_stock_items_formulation_check CHECK ((formulation = ANY (ARRAY['tablet'::text, 'capsule'::text, 'liquid'::text, 'syrup'::text, 'suspension'::text, 'injection'::text, 'powder'::text, 'inhaler'::text, 'drops'::text, 'cream'::text, 'ointment'::text, 'sachet'::text, 'vial'::text, 'patch'::text, 'other'::text])))
);


--
-- Name: COLUMN pharmacy_stock_items.is_unavailable; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pharmacy_stock_items.is_unavailable IS 'Staff-set: drug is currently unobtainable regardless of on-hand count. Out-of-stock = is_unavailable OR quantity_on_hand <= 0.';


--
-- Name: pharmacy_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_delta numeric(12,3) NOT NULL,
    visit_id uuid,
    recorded_by uuid,
    batch_number text,
    expires_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    prescription_order_id uuid,
    batch_id uuid,
    CONSTRAINT pharmacy_stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['received'::text, 'dispensed'::text, 'adjusted'::text, 'expired'::text, 'transferred_in'::text, 'transferred_out'::text])))
);


--
-- Name: pregnancies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pregnancies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    lmp date,
    edd date,
    gravida smallint,
    para smallint,
    blood_group text,
    hiv_status text,
    syphilis_status text,
    hepb_status text,
    risk_notes text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pregnancies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'closed'::text])))
);


--
-- Name: prescription_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    medication_code text,
    free_text_name text,
    dose_text text,
    route_text text,
    frequency_text text,
    duration_text text,
    quantity_prescribed numeric(10,2),
    quantity_unit text,
    status text DEFAULT 'ordered'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    ordered_by uuid,
    ordered_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT prescription_orders_has_name CHECK (((medication_code IS NOT NULL) OR (NULLIF(TRIM(BOTH FROM free_text_name), ''::text) IS NOT NULL))),
    CONSTRAINT prescription_orders_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'manual_confirmed'::text, 'ai_suggested'::text, 'legacy_text'::text]))),
    CONSTRAINT prescription_orders_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'dispensing'::text, 'dispensed'::text, 'partially_dispensed'::text, 'out_of_stock'::text, 'cancelled'::text, 'needs_clarification'::text])))
);


--
-- Name: protocol_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protocol_activations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    protocol_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    activated_by uuid NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT protocol_activations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: provider_note_addendums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_note_addendums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_note_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    addendum_text text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_note_amendments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_note_amendments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_note_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    prior_transcript text,
    prior_note_content text,
    new_transcript text,
    new_note_content text,
    reason text NOT NULL,
    amended_by uuid NOT NULL,
    amended_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    visit_id uuid,
    transcript text,
    note_content text,
    structured_data jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    finalized_at timestamp with time zone,
    finalized_by uuid,
    patient_id uuid NOT NULL,
    source text DEFAULT 'visit'::text NOT NULL,
    amended_at timestamp with time zone,
    amended_by uuid,
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,
    created_by uuid,
    requires_cosign boolean DEFAULT false NOT NULL,
    cosigned_at timestamp with time zone,
    cosigned_by uuid,
    updated_by uuid,
    CONSTRAINT provider_notes_source_check CHECK ((source = ANY (ARRAY['visit'::text, 'phone_call'::text, 'follow_up'::text, 'lab_update'::text, 'pharmacy_update'::text, 'general'::text]))),
    CONSTRAINT provider_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'signed'::text, 'cosigned'::text, 'addended'::text, 'amended'::text, 'voided'::text])))
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    from_department text DEFAULT 'opd'::text NOT NULL,
    to_facility text NOT NULL,
    urgency text NOT NULL,
    reason text NOT NULL,
    clinical_summary text,
    transport_mode text,
    referred_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT referrals_urgency_check CHECK ((urgency = ANY (ARRAY['routine'::text, 'urgent'::text, 'emergency'::text])))
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clerk_user_id text NOT NULL,
    clinic_id uuid NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    role text DEFAULT 'doctor'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deactivated_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    CONSTRAINT staff_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'clinical_officer'::text, 'midwife'::text, 'nursing_assistant'::text, 'records_officer'::text, 'lab_tech'::text, 'dispenser'::text])))
);


--
-- Name: COLUMN staff.onboarding_completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff.onboarding_completed_at IS 'Set when the staff member finishes all required EHR onboarding modules. NULL blocks rpc_create_patient.';


--
-- Name: staff_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_invitations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clinic_id uuid NOT NULL,
    clerk_organization_id text NOT NULL,
    clerk_invitation_id text,
    email text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by_staff_id uuid,
    invited_by_clerk_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT staff_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'clinical_officer'::text, 'midwife'::text, 'nursing_assistant'::text, 'records_officer'::text, 'lab_tech'::text, 'dispenser'::text]))),
    CONSTRAINT staff_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- Name: staff_onboarding_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_onboarding_progress (
    staff_id uuid NOT NULL,
    module_id text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    score integer,
    total integer
);


--
-- Name: superadmins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.superadmins (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clerk_user_id text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_operations (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    staff_id uuid,
    operation_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tb_episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_episodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    unit_tb_number text,
    registered_at date DEFAULT CURRENT_DATE NOT NULL,
    case_type text DEFAULT 'new'::text NOT NULL,
    disease_class text DEFAULT 'pulmonary_smear_positive'::text NOT NULL,
    ept_site text,
    hiv_status text,
    on_art_at_diagnosis boolean DEFAULT false NOT NULL,
    on_cpt_at_diagnosis boolean DEFAULT false NOT NULL,
    treatment_started_at date,
    regimen_category text,
    treatment_phase text,
    outcome text,
    outcome_date date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_episodes_case_type_check CHECK ((case_type = ANY (ARRAY['new'::text, 'relapse'::text, 'retreatment_default'::text, 'failure'::text, 'other'::text]))),
    CONSTRAINT tb_episodes_disease_class_check CHECK ((disease_class = ANY (ARRAY['pulmonary_smear_positive'::text, 'pulmonary_smear_negative'::text, 'extrapulmonary'::text]))),
    CONSTRAINT tb_episodes_hiv_status_check CHECK ((hiv_status = ANY (ARRAY['positive'::text, 'negative'::text, 'unknown'::text]))),
    CONSTRAINT tb_episodes_outcome_check CHECK ((outcome = ANY (ARRAY['ongoing'::text, 'cured'::text, 'completed'::text, 'failure'::text, 'default'::text, 'transferred_out'::text, 'died'::text]))),
    CONSTRAINT tb_episodes_regimen_category_check CHECK ((regimen_category = ANY (ARRAY['cat1'::text, 'cat2'::text, 'cat3'::text]))),
    CONSTRAINT tb_episodes_treatment_phase_check CHECK ((treatment_phase = ANY (ARRAY['intensive'::text, 'continuation'::text])))
);


--
-- Name: tb_preventive_treatment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_preventive_treatment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    indication text NOT NULL,
    started_at date DEFAULT CURRENT_DATE NOT NULL,
    completed_at date,
    regimen text,
    completed boolean DEFAULT false NOT NULL,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_preventive_treatment_indication_check CHECK ((indication = ANY (ARRAY['plhiv'::text, 'child_contact'::text, 'other'::text])))
);


--
-- Name: viral_load_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viral_load_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    enrollment_id uuid,
    test_date date DEFAULT CURRENT_DATE NOT NULL,
    result_copies numeric,
    suppressed boolean,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visit_critical_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_critical_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    rule_slug text NOT NULL,
    confirm_question text NOT NULL,
    clinical_prompt text NOT NULL,
    library_slug text,
    clinician_response text,
    responded_at timestamp with time zone,
    responded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visit_critical_alerts_clinician_response_check CHECK (((clinician_response IS NULL) OR (clinician_response = ANY (ARRAY['confirmed'::text, 'data_error'::text, 'dismissed'::text]))))
);


--
-- Name: visit_diagnosis_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_diagnosis_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    visit_id uuid NOT NULL,
    hmis_code_id integer NOT NULL,
    confidence numeric,
    source text DEFAULT 'ai'::text NOT NULL,
    coded_by uuid,
    coded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT visit_diagnosis_codes_source_check CHECK ((source = ANY (ARRAY['ai'::text, 'manual'::text, 'ai_confirmed'::text])))
);


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    diagnosis text,
    medications text,
    follow_up_instructions text,
    tests_ordered text,
    visit_date date DEFAULT public.kampala_today(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    finalized_at timestamp with time zone,
    error_message text,
    error_at timestamp with time zone,
    checked_in_at timestamp with time zone,
    nurse_id uuid,
    queue_position integer,
    queue_status text DEFAULT 'waiting'::text,
    estimated_wait_minutes integer,
    chief_complaint text,
    priority text DEFAULT 'normal'::text,
    review_status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    department text DEFAULT 'opd'::text NOT NULL,
    documentation_complete boolean DEFAULT false NOT NULL,
    documentation_completed_at timestamp with time zone,
    dispensing_status text DEFAULT 'not_started'::text NOT NULL,
    dispensed_at timestamp with time zone,
    dispensed_by uuid,
    dispense_notes text,
    lab_status text DEFAULT 'not_ordered'::text NOT NULL,
    lab_results text,
    lab_abnormal boolean DEFAULT false NOT NULL,
    lab_completed_at timestamp with time zone,
    lab_completed_by uuid,
    ai_structure_status text DEFAULT 'not_started'::text NOT NULL,
    ai_structure_started_at timestamp with time zone,
    ai_structure_completed_at timestamp with time zone,
    ai_structure_error text,
    ai_structure_attempts integer DEFAULT 0 NOT NULL,
    ai_review_status text DEFAULT 'not_started'::text NOT NULL,
    ai_review_started_at timestamp with time zone,
    ai_review_completed_at timestamp with time zone,
    ai_review_no_concerns boolean DEFAULT false NOT NULL,
    ai_review_error text,
    ai_review_attempts integer DEFAULT 0 NOT NULL,
    pharmacy_order_submitted_at timestamp with time zone,
    pharmacy_order_submitted_by uuid,
    admission_id uuid,
    lab_test_results jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT visits_ai_review_status_check CHECK ((ai_review_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT visits_ai_structure_status_check CHECK ((ai_structure_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT visits_department_check CHECK ((department = ANY (ARRAY['opd'::text, 'anc'::text, 'maternity'::text, 'family_planning'::text, 'immunization'::text]))),
    CONSTRAINT visits_dispensing_status_check CHECK ((dispensing_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'dispensed'::text, 'partial'::text, 'out_of_stock'::text, 'returned'::text]))),
    CONSTRAINT visits_lab_status_check CHECK ((lab_status = ANY (ARRAY['not_ordered'::text, 'pending'::text, 'running'::text, 'done'::text, 'abnormal'::text]))),
    CONSTRAINT visits_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT visits_queue_status_check CHECK ((queue_status = ANY (ARRAY['waiting'::text, 'with_nurse'::text, 'ready_for_doctor'::text, 'with_doctor'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT visits_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'pending_review'::text, 'reviewed'::text, 'rejected'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'review'::text, 'sent'::text, 'completed'::text, 'error'::text])))
);


--
-- Name: COLUMN visits.dispensing_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.dispensing_status IS 'Pharmacy MVP — workflow state for dispensing the clinician''s `medications` text. Replaced by structured prescriptions + dispense_records in a future migration.';


--
-- Name: COLUMN visits.lab_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.lab_status IS 'Lab MVP — workflow state for completing the clinician''s `tests_ordered` text. Replaced by structured lab_orders + lab_results in a future migration.';


--
-- Name: COLUMN visits.lab_abnormal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.lab_abnormal IS 'Lab tech sets this when entering results that should ping the ordering clinician.';


--
-- Name: COLUMN visits.ai_structure_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.ai_structure_status IS 'AI structuring lifecycle, independent of clinical visit.status. Driven by the Inngest poller. Values: not_started | pending | running | completed | failed | skipped.';


--
-- Name: COLUMN visits.ai_structure_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.ai_structure_attempts IS 'Retry counter incremented by the Inngest function on each run. Poller skips visits at >= 5.';


--
-- Name: COLUMN visits.ai_review_no_concerns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.ai_review_no_concerns IS 'Set by reviewClinicianNote when AI ran successfully and produced zero high-confidence disagreements. UI uses this to differentiate "AI checked, all clear" from "AI never ran".';


--
-- Name: COLUMN visits.lab_test_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.lab_test_results IS 'Array of {test, status, result, abnormal, started_at, completed_at} — one entry per test in tests_ordered.';


--
-- Name: hmis_106a_elements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_106a_elements ALTER COLUMN id SET DEFAULT nextval('public.hmis_106a_elements_id_seq'::regclass);


--
-- Name: hmis_diagnosis_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_diagnosis_codes ALTER COLUMN id SET DEFAULT nextval('public.hmis_diagnosis_codes_id_seq'::regclass);


--
-- Name: medical_corpus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_corpus ALTER COLUMN id SET DEFAULT nextval('public.medical_corpus_id_seq'::regclass);


--
-- Name: medical_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_documents ALTER COLUMN id SET DEFAULT nextval('public.medical_documents_id_seq'::regclass);


--
-- Name: admission_notes admission_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_notes
    ADD CONSTRAINT admission_notes_pkey PRIMARY KEY (id);


--
-- Name: admission_observations admission_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_observations
    ADD CONSTRAINT admission_observations_pkey PRIMARY KEY (id);


--
-- Name: admissions admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);


--
-- Name: ai_review_suggestions ai_review_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_review_suggestions
    ADD CONSTRAINT ai_review_suggestions_pkey PRIMARY KEY (id);


--
-- Name: anc_contacts anc_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anc_contacts
    ADD CONSTRAINT anc_contacts_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: care_tasks care_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_pkey PRIMARY KEY (id);


--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_pkey PRIMARY KEY (id);


--
-- Name: chart_access_log chart_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_access_log
    ADD CONSTRAINT chart_access_log_pkey PRIMARY KEY (id);


--
-- Name: chart_access_log chart_access_log_staff_id_patient_id_accessed_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_access_log
    ADD CONSTRAINT chart_access_log_staff_id_patient_id_accessed_on_key UNIQUE (staff_id, patient_id, accessed_on);


--
-- Name: clinic_billing_rates clinic_billing_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_rates
    ADD CONSTRAINT clinic_billing_rates_pkey PRIMARY KEY (clinic_id);


--
-- Name: clinic_departments clinic_departments_clinic_id_department_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments
    ADD CONSTRAINT clinic_departments_clinic_id_department_key UNIQUE (clinic_id, department);


--
-- Name: clinic_departments clinic_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments
    ADD CONSTRAINT clinic_departments_pkey PRIMARY KEY (id);


--
-- Name: clinic_lab_capabilities clinic_lab_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_capabilities
    ADD CONSTRAINT clinic_lab_capabilities_pkey PRIMARY KEY (clinic_id, test_name);


--
-- Name: clinic_pharmacy_formulary clinic_pharmacy_formulary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_formulary
    ADD CONSTRAINT clinic_pharmacy_formulary_pkey PRIMARY KEY (clinic_id, drug_name);


--
-- Name: clinic_print_settings clinic_print_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_print_settings
    ADD CONSTRAINT clinic_print_settings_pkey PRIMARY KEY (clinic_id);


--
-- Name: clinic_protocol_enrollments clinic_protocol_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_protocol_enrollments
    ADD CONSTRAINT clinic_protocol_enrollments_pkey PRIMARY KEY (clinic_id, protocol_id);


--
-- Name: clinical_protocol_definitions clinical_protocol_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_protocol_definitions
    ADD CONSTRAINT clinical_protocol_definitions_pkey PRIMARY KEY (id);


--
-- Name: clinical_protocol_definitions clinical_protocol_definitions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_protocol_definitions
    ADD CONSTRAINT clinical_protocol_definitions_slug_key UNIQUE (slug);


--
-- Name: clinics clinics_clerk_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_clerk_organization_id_key UNIQUE (clerk_organization_id);


--
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);


--
-- Name: clinics clinics_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_slug_key UNIQUE (slug);


--
-- Name: cme_flashcards cme_flashcards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_flashcards
    ADD CONSTRAINT cme_flashcards_pkey PRIMARY KEY (id);


--
-- Name: cme_lessons cme_lessons_module_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_lessons
    ADD CONSTRAINT cme_lessons_module_id_slug_key UNIQUE (module_id, slug);


--
-- Name: cme_lessons cme_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_lessons
    ADD CONSTRAINT cme_lessons_pkey PRIMARY KEY (id);


--
-- Name: cme_modules cme_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_modules
    ADD CONSTRAINT cme_modules_pkey PRIMARY KEY (id);


--
-- Name: cme_modules cme_modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_modules
    ADD CONSTRAINT cme_modules_slug_key UNIQUE (slug);


--
-- Name: cme_quiz_attempts cme_quiz_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_quiz_attempts
    ADD CONSTRAINT cme_quiz_attempts_pkey PRIMARY KEY (id);


--
-- Name: cme_quiz_questions cme_quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_quiz_questions
    ADD CONSTRAINT cme_quiz_questions_pkey PRIMARY KEY (id);


--
-- Name: consult_messages consult_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_messages
    ADD CONSTRAINT consult_messages_pkey PRIMARY KEY (id);


--
-- Name: consult_threads consult_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_pkey PRIMARY KEY (id);


--
-- Name: consult_threads consult_threads_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_visit_id_key UNIQUE (visit_id);


--
-- Name: deliveries deliveries_admission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_admission_id_key UNIQUE (admission_id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: diocese_coordinators diocese_coordinators_clerk_user_id_diocese_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diocese_coordinators
    ADD CONSTRAINT diocese_coordinators_clerk_user_id_diocese_key UNIQUE (clerk_user_id, diocese);


--
-- Name: diocese_coordinators diocese_coordinators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diocese_coordinators
    ADD CONSTRAINT diocese_coordinators_pkey PRIMARY KEY (id);


--
-- Name: dispense_records dispense_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_pkey PRIMARY KEY (id);


--
-- Name: ebola_screenings ebola_screenings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebola_screenings
    ADD CONSTRAINT ebola_screenings_pkey PRIMARY KEY (id);


--
-- Name: hiv_care_enrollments hiv_care_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiv_care_enrollments
    ADD CONSTRAINT hiv_care_enrollments_pkey PRIMARY KEY (id);


--
-- Name: hmis_106a_elements hmis_106a_elements_element_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_106a_elements
    ADD CONSTRAINT hmis_106a_elements_element_code_key UNIQUE (element_code);


--
-- Name: hmis_106a_elements hmis_106a_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_106a_elements
    ADD CONSTRAINT hmis_106a_elements_pkey PRIMARY KEY (id);


--
-- Name: hmis_diagnosis_codes hmis_diagnosis_codes_hmis_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_diagnosis_codes
    ADD CONSTRAINT hmis_diagnosis_codes_hmis_code_key UNIQUE (hmis_code);


--
-- Name: hmis_diagnosis_codes hmis_diagnosis_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hmis_diagnosis_codes
    ADD CONSTRAINT hmis_diagnosis_codes_pkey PRIMARY KEY (id);


--
-- Name: hts_events hts_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_pkey PRIMARY KEY (id);


--
-- Name: iv_infusion_checks iv_infusion_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusion_checks
    ADD CONSTRAINT iv_infusion_checks_pkey PRIMARY KEY (id);


--
-- Name: iv_infusions iv_infusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusions
    ADD CONSTRAINT iv_infusions_pkey PRIMARY KEY (id);


--
-- Name: lab_stock_items lab_stock_items_clinic_id_test_name_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_items
    ADD CONSTRAINT lab_stock_items_clinic_id_test_name_batch_number_key UNIQUE (clinic_id, test_name, batch_number);


--
-- Name: lab_stock_items lab_stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_items
    ADD CONSTRAINT lab_stock_items_pkey PRIMARY KEY (id);


--
-- Name: lab_stock_movements lab_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_movements
    ADD CONSTRAINT lab_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: lab_test_catalog lab_test_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_test_catalog
    ADD CONSTRAINT lab_test_catalog_pkey PRIMARY KEY (code);


--
-- Name: medical_corpus medical_corpus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_corpus
    ADD CONSTRAINT medical_corpus_pkey PRIMARY KEY (id);


--
-- Name: medical_documents medical_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_documents
    ADD CONSTRAINT medical_documents_pkey PRIMARY KEY (id);


--
-- Name: medical_documents medical_documents_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_documents
    ADD CONSTRAINT medical_documents_slug_key UNIQUE (slug);


--
-- Name: medication_administrations medication_administrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_administrations
    ADD CONSTRAINT medication_administrations_pkey PRIMARY KEY (id);


--
-- Name: medication_catalog medication_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_catalog
    ADD CONSTRAINT medication_catalog_pkey PRIMARY KEY (code);


--
-- Name: medication_orders medication_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_orders
    ADD CONSTRAINT medication_orders_pkey PRIMARY KEY (id);


--
-- Name: message_logs message_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_logs
    ADD CONSTRAINT message_logs_pkey PRIMARY KEY (id);


--
-- Name: patient_notes patient_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_pkey PRIMARY KEY (id);


--
-- Name: patient_notes patient_notes_visit_id_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_visit_id_source_key UNIQUE (visit_id, source);


--
-- Name: patient_number_sequences patient_number_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_number_sequences
    ADD CONSTRAINT patient_number_sequences_pkey PRIMARY KEY (clinic_id);


--
-- Name: patient_vitals patient_vitals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: payment_receipt_sequences payment_receipt_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipt_sequences
    ADD CONSTRAINT payment_receipt_sequences_pkey PRIMARY KEY (clinic_id, sequence_date);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_receipt_number_key UNIQUE (receipt_number);


--
-- Name: pharmacy_stock_batches pharmacy_stock_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_batches
    ADD CONSTRAINT pharmacy_stock_batches_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_stock_items pharmacy_stock_items_clinic_id_drug_code_strength_formulati_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_items
    ADD CONSTRAINT pharmacy_stock_items_clinic_id_drug_code_strength_formulati_key UNIQUE (clinic_id, drug_code, strength, formulation);


--
-- Name: pharmacy_stock_items pharmacy_stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_items
    ADD CONSTRAINT pharmacy_stock_items_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: postnatal_observations postnatal_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postnatal_observations
    ADD CONSTRAINT postnatal_observations_pkey PRIMARY KEY (id);


--
-- Name: pregnancies pregnancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pregnancies
    ADD CONSTRAINT pregnancies_pkey PRIMARY KEY (id);


--
-- Name: prescription_orders prescription_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_pkey PRIMARY KEY (id);


--
-- Name: protocol_activations protocol_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_pkey PRIMARY KEY (id);


--
-- Name: provider_note_addendums provider_note_addendums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_pkey PRIMARY KEY (id);


--
-- Name: provider_note_amendments provider_note_amendments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_amendments
    ADD CONSTRAINT provider_note_amendments_pkey PRIMARY KEY (id);


--
-- Name: provider_notes provider_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: region_protocols region_protocols_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_protocols
    ADD CONSTRAINT region_protocols_pkey PRIMARY KEY (id);


--
-- Name: region_protocols region_protocols_protocol_scope_type_scope_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_protocols
    ADD CONSTRAINT region_protocols_protocol_scope_type_scope_value_key UNIQUE (protocol, scope_type, scope_value);


--
-- Name: staff staff_clerk_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_clerk_user_id_key UNIQUE (clerk_user_id);


--
-- Name: staff_invitations staff_invitations_clerk_invitation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_clerk_invitation_id_key UNIQUE (clerk_invitation_id);


--
-- Name: staff_invitations staff_invitations_clinic_id_email_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_clinic_id_email_status_key UNIQUE (clinic_id, email, status);


--
-- Name: staff_invitations staff_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_pkey PRIMARY KEY (id);


--
-- Name: staff_onboarding_progress staff_onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_onboarding_progress
    ADD CONSTRAINT staff_onboarding_progress_pkey PRIMARY KEY (staff_id, module_id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: superadmins superadmins_clerk_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmins
    ADD CONSTRAINT superadmins_clerk_user_id_key UNIQUE (clerk_user_id);


--
-- Name: superadmins superadmins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.superadmins
    ADD CONSTRAINT superadmins_pkey PRIMARY KEY (id);


--
-- Name: sync_operations sync_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_operations
    ADD CONSTRAINT sync_operations_pkey PRIMARY KEY (id);


--
-- Name: tb_episodes tb_episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_episodes
    ADD CONSTRAINT tb_episodes_pkey PRIMARY KEY (id);


--
-- Name: tb_preventive_treatment tb_preventive_treatment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_preventive_treatment
    ADD CONSTRAINT tb_preventive_treatment_pkey PRIMARY KEY (id);


--
-- Name: viral_load_tests viral_load_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_load_tests
    ADD CONSTRAINT viral_load_tests_pkey PRIMARY KEY (id);


--
-- Name: visit_critical_alerts visit_critical_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_critical_alerts
    ADD CONSTRAINT visit_critical_alerts_pkey PRIMARY KEY (id);


--
-- Name: visit_critical_alerts visit_critical_alerts_visit_id_rule_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_critical_alerts
    ADD CONSTRAINT visit_critical_alerts_visit_id_rule_slug_key UNIQUE (visit_id, rule_slug);


--
-- Name: visit_diagnosis_codes visit_diagnosis_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis_codes
    ADD CONSTRAINT visit_diagnosis_codes_pkey PRIMARY KEY (id);


--
-- Name: visit_diagnosis_codes visit_diagnosis_codes_visit_id_hmis_code_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis_codes
    ADD CONSTRAINT visit_diagnosis_codes_visit_id_hmis_code_id_key UNIQUE (visit_id, hmis_code_id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: idx_admission_notes_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admission_notes_admission ON public.admission_notes USING btree (admission_id, created_at DESC);


--
-- Name: idx_admission_observations_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admission_observations_admission ON public.admission_observations USING btree (admission_id, observed_at DESC);


--
-- Name: idx_admissions_clinic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admissions_clinic_status ON public.admissions USING btree (clinic_id, status, admitted_at DESC);


--
-- Name: idx_admissions_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admissions_patient ON public.admissions USING btree (patient_id, admitted_at DESC);


--
-- Name: idx_ai_review_suggestions_clinic_unanswered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_review_suggestions_clinic_unanswered ON public.ai_review_suggestions USING btree (clinic_id, created_at DESC) WHERE (clinician_response IS NULL);


--
-- Name: idx_ai_review_suggestions_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_review_suggestions_visit ON public.ai_review_suggestions USING btree (visit_id, created_at DESC);


--
-- Name: idx_anc_contacts_pregnancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anc_contacts_pregnancy ON public.anc_contacts USING btree (pregnancy_id, contact_date DESC);


--
-- Name: idx_appointments_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_clinic_date ON public.appointments USING btree (clinic_id, scheduled_at);


--
-- Name: idx_appointments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient ON public.appointments USING btree (patient_id) WHERE (patient_id IS NOT NULL);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_actor_clerk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor_clerk ON public.audit_logs USING btree (actor_clerk_id) WHERE (actor_clerk_id IS NOT NULL);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_patient ON public.audit_logs USING btree (patient_id) WHERE (patient_id IS NOT NULL);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_care_tasks_assignee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_tasks_assignee_status ON public.care_tasks USING btree (assignee_id, status) WHERE (assignee_id IS NOT NULL);


--
-- Name: idx_care_tasks_clinic_status_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_tasks_clinic_status_due ON public.care_tasks USING btree (clinic_id, status, due_at);


--
-- Name: idx_care_tasks_patient_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_tasks_patient_status ON public.care_tasks USING btree (patient_id, status);


--
-- Name: idx_care_tasks_role_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_tasks_role_status ON public.care_tasks USING btree (clinic_id, assignee_role, status) WHERE (assignee_role IS NOT NULL);


--
-- Name: idx_care_tasks_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_tasks_visit ON public.care_tasks USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_charges_clinic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_charges_clinic ON public.charges USING btree (clinic_id, created_at DESC);


--
-- Name: idx_charges_clinic_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_charges_clinic_patient ON public.charges USING btree (clinic_id, patient_id) WHERE (NOT voided);


--
-- Name: idx_charges_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_charges_patient ON public.charges USING btree (patient_id) WHERE (NOT voided);


--
-- Name: idx_charges_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_charges_visit ON public.charges USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_chart_access_log_clinic_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chart_access_log_clinic_day ON public.chart_access_log USING btree (clinic_id, accessed_on DESC);


--
-- Name: idx_chart_access_log_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chart_access_log_patient ON public.chart_access_log USING btree (patient_id, accessed_on DESC);


--
-- Name: idx_clinic_departments_clinic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_departments_clinic_id ON public.clinic_departments USING btree (clinic_id);


--
-- Name: idx_clinic_lab_capabilities_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_lab_capabilities_available ON public.clinic_lab_capabilities USING btree (clinic_id) WHERE (is_available = true);


--
-- Name: idx_clinic_lab_capabilities_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_lab_capabilities_code ON public.clinic_lab_capabilities USING btree (clinic_id, code) WHERE (code IS NOT NULL);


--
-- Name: idx_clinic_pharmacy_formulary_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_pharmacy_formulary_code ON public.clinic_pharmacy_formulary USING btree (clinic_id, code) WHERE (code IS NOT NULL);


--
-- Name: idx_clinic_pharmacy_formulary_medication_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_pharmacy_formulary_medication_code ON public.clinic_pharmacy_formulary USING btree (clinic_id, medication_code) WHERE (medication_code IS NOT NULL);


--
-- Name: idx_clinic_pharmacy_in_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_pharmacy_in_stock ON public.clinic_pharmacy_formulary USING btree (clinic_id) WHERE (in_stock = true);


--
-- Name: idx_clinics_clerk_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinics_clerk_org ON public.clinics USING btree (clerk_organization_id);


--
-- Name: idx_consult_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consult_messages_thread ON public.consult_messages USING btree (thread_id, created_at);


--
-- Name: idx_deliveries_clinic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_clinic ON public.deliveries USING btree (clinic_id, delivered_at DESC);


--
-- Name: idx_diocese_coordinators_clerk_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diocese_coordinators_clerk_user_id ON public.diocese_coordinators USING btree (clerk_user_id);


--
-- Name: idx_dispense_records_prescription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispense_records_prescription ON public.dispense_records USING btree (prescription_order_id);


--
-- Name: idx_dispense_records_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispense_records_visit ON public.dispense_records USING btree (visit_id, dispensed_at DESC);


--
-- Name: idx_ebola_screenings_clinic_suspect; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ebola_screenings_clinic_suspect ON public.ebola_screenings USING btree (clinic_id, is_suspect, created_at DESC);


--
-- Name: idx_ebola_screenings_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ebola_screenings_visit ON public.ebola_screenings USING btree (visit_id, created_at DESC);


--
-- Name: idx_hiv_care_clinic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hiv_care_clinic_status ON public.hiv_care_enrollments USING btree (clinic_id, care_status);


--
-- Name: idx_hiv_care_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hiv_care_patient ON public.hiv_care_enrollments USING btree (patient_id);


--
-- Name: idx_hts_events_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hts_events_clinic_date ON public.hts_events USING btree (clinic_id, event_date);


--
-- Name: idx_hts_events_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hts_events_patient ON public.hts_events USING btree (patient_id, event_date DESC);


--
-- Name: idx_iv_infusion_checks_infusion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iv_infusion_checks_infusion ON public.iv_infusion_checks USING btree (infusion_id, checked_at DESC);


--
-- Name: idx_iv_infusions_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iv_infusions_admission ON public.iv_infusions USING btree (admission_id, active, started_at DESC);


--
-- Name: idx_lab_stock_clinic_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_stock_clinic_active ON public.lab_stock_items USING btree (clinic_id) WHERE active;


--
-- Name: idx_lab_stock_low; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_stock_low ON public.lab_stock_items USING btree (clinic_id) WHERE (active AND (quantity_on_hand <= low_stock_threshold));


--
-- Name: idx_lab_stock_movements_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_stock_movements_item ON public.lab_stock_movements USING btree (stock_item_id, created_at DESC);


--
-- Name: idx_medical_corpus_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_corpus_anchor ON public.medical_corpus USING btree (document_id, section_anchor) WHERE (section_anchor IS NOT NULL);


--
-- Name: idx_medical_corpus_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_corpus_document ON public.medical_corpus USING btree (document_id, chunk_index);


--
-- Name: idx_medical_corpus_embedding_cosine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_corpus_embedding_cosine ON public.medical_corpus USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_medical_documents_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_documents_jurisdiction ON public.medical_documents USING btree (jurisdiction) WHERE (is_published = true);


--
-- Name: idx_medical_documents_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_documents_topic ON public.medical_documents USING btree (topic) WHERE (is_published = true);


--
-- Name: idx_medication_administrations_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_administrations_admission ON public.medication_administrations USING btree (admission_id, administered_at DESC);


--
-- Name: idx_medication_administrations_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_administrations_order ON public.medication_administrations USING btree (order_id, administered_at DESC);


--
-- Name: idx_medication_administrations_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_administrations_scheduled ON public.medication_administrations USING btree (order_id, scheduled_for);


--
-- Name: idx_medication_orders_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_orders_admission ON public.medication_orders USING btree (admission_id, active);


--
-- Name: idx_patient_notes_visit_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_notes_visit_source ON public.patient_notes USING btree (visit_id, source);


--
-- Name: idx_patient_vitals_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_vitals_patient ON public.patient_vitals USING btree (patient_id, recorded_at DESC);


--
-- Name: idx_patient_vitals_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_vitals_visit ON public.patient_vitals USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_patients_clinic_guardian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_guardian ON public.patients USING btree (clinic_id, guardian_name) WHERE (guardian_name IS NOT NULL);


--
-- Name: idx_patients_clinic_location_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_location_sort ON public.patients USING btree (clinic_id, village, parish) WHERE ((village IS NOT NULL) OR (parish IS NOT NULL));


--
-- Name: idx_patients_clinic_name_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_name_sort ON public.patients USING btree (clinic_id, last_name, first_name);


--
-- Name: idx_patients_clinic_national_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_national_id ON public.patients USING btree (clinic_id, national_id) WHERE (national_id IS NOT NULL);


--
-- Name: idx_patients_clinic_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patients_clinic_number ON public.patients USING btree (clinic_id, patient_number);


--
-- Name: idx_patients_clinic_parish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_parish ON public.patients USING btree (clinic_id, parish) WHERE (parish IS NOT NULL);


--
-- Name: idx_patients_clinic_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patients_clinic_phone_unique ON public.patients USING btree (clinic_id, whatsapp_number) WHERE (whatsapp_number IS NOT NULL);


--
-- Name: idx_patients_clinic_village; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_clinic_village ON public.patients USING btree (clinic_id, village) WHERE (village IS NOT NULL);


--
-- Name: idx_patients_clinic_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patients_clinic_whatsapp ON public.patients USING btree (clinic_id, whatsapp_number) WHERE (whatsapp_number IS NOT NULL);


--
-- Name: idx_patients_first_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_first_name ON public.patients USING btree (first_name);


--
-- Name: idx_patients_first_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_first_name_trgm ON public.patients USING gin (first_name public.gin_trgm_ops);


--
-- Name: idx_patients_last_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_last_name ON public.patients USING btree (last_name);


--
-- Name: idx_patients_last_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_last_name_trgm ON public.patients USING gin (last_name public.gin_trgm_ops);


--
-- Name: idx_patients_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patients_patient_id ON public.patients USING btree (patient_id);


--
-- Name: idx_patients_village_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_village_trgm ON public.patients USING gin (village public.gin_trgm_ops) WHERE (village IS NOT NULL);


--
-- Name: idx_payments_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_clinic_date ON public.payments USING btree (clinic_id, created_at DESC);


--
-- Name: idx_payments_clinic_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_clinic_patient ON public.payments USING btree (clinic_id, patient_id) WHERE (status = 'paid'::text);


--
-- Name: idx_payments_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_receipt ON public.payments USING btree (receipt_number);


--
-- Name: idx_payments_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_visit ON public.payments USING btree (visit_id);


--
-- Name: idx_pharmacy_stock_batches_clinic_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_batches_clinic_expiry ON public.pharmacy_stock_batches USING btree (clinic_id, expires_at) WHERE (active AND (expires_at IS NOT NULL));


--
-- Name: idx_pharmacy_stock_batches_item_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_batches_item_active ON public.pharmacy_stock_batches USING btree (stock_item_id) WHERE active;


--
-- Name: idx_pharmacy_stock_batches_item_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pharmacy_stock_batches_item_batch ON public.pharmacy_stock_batches USING btree (stock_item_id, batch_number) WHERE (batch_number IS NOT NULL);


--
-- Name: idx_pharmacy_stock_clinic_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_clinic_active ON public.pharmacy_stock_items USING btree (clinic_id) WHERE active;


--
-- Name: idx_pharmacy_stock_low; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_low ON public.pharmacy_stock_items USING btree (clinic_id) WHERE (active AND (quantity_on_hand <= low_stock_threshold));


--
-- Name: idx_pharmacy_stock_movements_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_movements_batch ON public.pharmacy_stock_movements USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: idx_pharmacy_stock_movements_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_movements_item ON public.pharmacy_stock_movements USING btree (stock_item_id, created_at DESC);


--
-- Name: idx_pharmacy_stock_movements_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pharmacy_stock_movements_visit ON public.pharmacy_stock_movements USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_postnatal_observations_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postnatal_observations_admission ON public.postnatal_observations USING btree (admission_id, observed_at DESC);


--
-- Name: idx_pregnancies_clinic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pregnancies_clinic_status ON public.pregnancies USING btree (clinic_id, status, edd);


--
-- Name: idx_pregnancies_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pregnancies_patient ON public.pregnancies USING btree (patient_id);


--
-- Name: idx_prescription_orders_clinic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prescription_orders_clinic_status ON public.prescription_orders USING btree (clinic_id, status);


--
-- Name: idx_prescription_orders_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prescription_orders_visit ON public.prescription_orders USING btree (visit_id, sort_order);


--
-- Name: idx_protocol_activations_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocol_activations_patient ON public.protocol_activations USING btree (patient_id, status);


--
-- Name: idx_provider_note_addendums_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_note_addendums_parent ON public.provider_note_addendums USING btree (parent_note_id, created_at);


--
-- Name: idx_provider_note_addendums_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_note_addendums_patient ON public.provider_note_addendums USING btree (patient_id, created_at DESC);


--
-- Name: idx_provider_note_amendments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_note_amendments_parent ON public.provider_note_amendments USING btree (parent_note_id, amended_at DESC);


--
-- Name: idx_provider_notes_created_by_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_notes_created_by_status ON public.provider_notes USING btree (created_by, status) WHERE (created_by IS NOT NULL);


--
-- Name: idx_provider_notes_patient_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_notes_patient_status ON public.provider_notes USING btree (patient_id, status);


--
-- Name: idx_provider_notes_patient_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_notes_patient_updated ON public.provider_notes USING btree (patient_id, updated_at DESC);


--
-- Name: idx_provider_notes_requires_cosign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_notes_requires_cosign ON public.provider_notes USING btree (patient_id) WHERE requires_cosign;


--
-- Name: idx_provider_notes_visit_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_provider_notes_visit_unique ON public.provider_notes USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_referrals_clinic_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_clinic_created ON public.referrals USING btree (clinic_id, created_at DESC);


--
-- Name: idx_referrals_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_patient ON public.referrals USING btree (patient_id, created_at DESC);


--
-- Name: idx_referrals_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_visit ON public.referrals USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_region_protocols_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_region_protocols_active ON public.region_protocols USING btree (active, scope_type, scope_value);


--
-- Name: idx_staff_invitations_clinic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_invitations_clinic_id ON public.staff_invitations USING btree (clinic_id);


--
-- Name: idx_staff_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_invitations_email ON public.staff_invitations USING btree (email);


--
-- Name: idx_staff_onboarding_progress_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_onboarding_progress_staff ON public.staff_onboarding_progress USING btree (staff_id);


--
-- Name: idx_superadmins_clerk_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superadmins_clerk_user_id ON public.superadmins USING btree (clerk_user_id);


--
-- Name: idx_sync_operations_clinic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_operations_clinic ON public.sync_operations USING btree (clinic_id, applied_at DESC);


--
-- Name: idx_tb_episodes_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tb_episodes_clinic_date ON public.tb_episodes USING btree (clinic_id, registered_at);


--
-- Name: idx_tb_episodes_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tb_episodes_patient ON public.tb_episodes USING btree (patient_id);


--
-- Name: idx_tpt_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpt_clinic_date ON public.tb_preventive_treatment USING btree (clinic_id, started_at);


--
-- Name: idx_visit_critical_alerts_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_critical_alerts_visit ON public.visit_critical_alerts USING btree (visit_id, created_at DESC);


--
-- Name: idx_visit_diagnosis_codes_hmis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_diagnosis_codes_hmis ON public.visit_diagnosis_codes USING btree (hmis_code_id);


--
-- Name: idx_visit_diagnosis_codes_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_diagnosis_codes_visit ON public.visit_diagnosis_codes USING btree (visit_id);


--
-- Name: idx_visits_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_admission ON public.visits USING btree (admission_id) WHERE (admission_id IS NOT NULL);


--
-- Name: idx_visits_ai_review_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_ai_review_queue ON public.visits USING btree (clinic_id, documentation_completed_at) WHERE ((documentation_complete = true) AND (ai_review_status = ANY (ARRAY['not_started'::text, 'pending'::text])) AND (ai_review_attempts < 5));


--
-- Name: idx_visits_ai_structure_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_ai_structure_queue ON public.visits USING btree (clinic_id, documentation_completed_at) WHERE ((documentation_complete = true) AND (ai_structure_status = ANY (ARRAY['not_started'::text, 'pending'::text])) AND (ai_structure_attempts < 5));


--
-- Name: idx_visits_clinic_dept_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_clinic_dept_date ON public.visits USING btree (clinic_id, department, visit_date);


--
-- Name: idx_visits_clinic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_clinic_status ON public.visits USING btree (clinic_id, status);


--
-- Name: idx_visits_doctor_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_doctor_date ON public.visits USING btree (doctor_id, visit_date DESC);


--
-- Name: idx_visits_doctor_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_doctor_queue ON public.visits USING btree (doctor_id, queue_status) WHERE (queue_status = 'with_doctor'::text);


--
-- Name: idx_visits_lab_abnormal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_lab_abnormal ON public.visits USING btree (clinic_id, doctor_id, visit_date DESC) WHERE (lab_abnormal = true);


--
-- Name: idx_visits_lab_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_lab_queue ON public.visits USING btree (clinic_id, lab_status, visit_date DESC) WHERE (lab_status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: idx_visits_nurse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_nurse ON public.visits USING btree (nurse_id, queue_status) WHERE (queue_status = 'with_nurse'::text);


--
-- Name: idx_visits_patient_visit_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_patient_visit_date ON public.visits USING btree (patient_id, visit_date DESC);


--
-- Name: idx_visits_pharmacy_order_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_pharmacy_order_submitted ON public.visits USING btree (clinic_id, pharmacy_order_submitted_at) WHERE (pharmacy_order_submitted_at IS NOT NULL);


--
-- Name: idx_visits_pharmacy_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_pharmacy_queue ON public.visits USING btree (clinic_id, dispensing_status, documentation_complete, visit_date DESC) WHERE (dispensing_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'partial'::text, 'out_of_stock'::text]));


--
-- Name: idx_visits_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_queue ON public.visits USING btree (clinic_id, visit_date, queue_status, queue_position) WHERE (queue_status = ANY (ARRAY['waiting'::text, 'with_nurse'::text, 'ready_for_doctor'::text, 'with_doctor'::text]));


--
-- Name: idx_vl_tests_clinic_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_tests_clinic_date ON public.viral_load_tests USING btree (clinic_id, test_date);


--
-- Name: patients assign_patient_id_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assign_patient_id_trigger BEFORE INSERT ON public.patients FOR EACH ROW EXECUTE FUNCTION public.assign_patient_id();


--
-- Name: provider_notes audit_provider_note_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_provider_note_changes AFTER UPDATE ON public.provider_notes FOR EACH ROW EXECUTE FUNCTION public.log_provider_note_changes();


--
-- Name: visits audit_visit_status_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_visit_status_changes AFTER UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.log_visit_status_changes();


--
-- Name: payments generate_payment_receipt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER generate_payment_receipt BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.generate_receipt_number();


--
-- Name: medical_documents medical_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER medical_documents_updated_at BEFORE UPDATE ON public.medical_documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: patients sync_patient_display_name_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_patient_display_name_trigger BEFORE INSERT OR UPDATE OF first_name, last_name ON public.patients FOR EACH ROW EXECUTE FUNCTION public.sync_patient_display_name();


--
-- Name: lab_stock_movements trg_lab_stock_movement_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lab_stock_movement_apply AFTER INSERT ON public.lab_stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_lab_stock_movement();


--
-- Name: lab_stock_items trg_lab_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lab_stock_updated_at BEFORE UPDATE ON public.lab_stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_stock();


--
-- Name: pharmacy_stock_movements trg_pharmacy_stock_movement_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pharmacy_stock_movement_apply AFTER INSERT ON public.pharmacy_stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_pharmacy_stock_movement();


--
-- Name: pharmacy_stock_items trg_pharmacy_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pharmacy_stock_updated_at BEFORE UPDATE ON public.pharmacy_stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_stock();


--
-- Name: care_tasks update_care_tasks_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_care_tasks_updated_at_trigger BEFORE UPDATE ON public.care_tasks FOR EACH ROW EXECUTE FUNCTION public.update_care_tasks_updated_at();


--
-- Name: clinics update_clinics_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: diocese_coordinators update_diocese_coordinators_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_diocese_coordinators_updated_at BEFORE UPDATE ON public.diocese_coordinators FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: patient_notes update_patient_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_patient_notes_updated_at BEFORE UPDATE ON public.patient_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: patients update_patients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: provider_notes update_provider_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_provider_notes_updated_at BEFORE UPDATE ON public.provider_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: staff_invitations update_staff_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_invitations_updated_at BEFORE UPDATE ON public.staff_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: staff update_staff_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: superadmins update_superadmins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_superadmins_updated_at BEFORE UPDATE ON public.superadmins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: visits update_visits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admission_notes admission_notes_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_notes
    ADD CONSTRAINT admission_notes_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: admission_notes admission_notes_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_notes
    ADD CONSTRAINT admission_notes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: admission_notes admission_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_notes
    ADD CONSTRAINT admission_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: admission_notes admission_notes_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_notes
    ADD CONSTRAINT admission_notes_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: admission_observations admission_observations_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_observations
    ADD CONSTRAINT admission_observations_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: admission_observations admission_observations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_observations
    ADD CONSTRAINT admission_observations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: admission_observations admission_observations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_observations
    ADD CONSTRAINT admission_observations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: admission_observations admission_observations_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_observations
    ADD CONSTRAINT admission_observations_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: admissions admissions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: admissions admissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: admissions admissions_discharged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_discharged_by_fkey FOREIGN KEY (discharged_by) REFERENCES public.staff(id);


--
-- Name: admissions admissions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;


--
-- Name: ai_review_suggestions ai_review_suggestions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_review_suggestions
    ADD CONSTRAINT ai_review_suggestions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: ai_review_suggestions ai_review_suggestions_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_review_suggestions
    ADD CONSTRAINT ai_review_suggestions_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.staff(id);


--
-- Name: ai_review_suggestions ai_review_suggestions_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_review_suggestions
    ADD CONSTRAINT ai_review_suggestions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: anc_contacts anc_contacts_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anc_contacts
    ADD CONSTRAINT anc_contacts_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: anc_contacts anc_contacts_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anc_contacts
    ADD CONSTRAINT anc_contacts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: anc_contacts anc_contacts_pregnancy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anc_contacts
    ADD CONSTRAINT anc_contacts_pregnancy_id_fkey FOREIGN KEY (pregnancy_id) REFERENCES public.pregnancies(id) ON DELETE CASCADE;


--
-- Name: anc_contacts anc_contacts_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anc_contacts
    ADD CONSTRAINT anc_contacts_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: appointments appointments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: care_tasks care_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: care_tasks care_tasks_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: care_tasks care_tasks_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.staff(id);


--
-- Name: care_tasks care_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: care_tasks care_tasks_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: care_tasks care_tasks_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_tasks
    ADD CONSTRAINT care_tasks_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: charges charges_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: charges charges_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: charges charges_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: charges charges_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: chart_access_log chart_access_log_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_access_log
    ADD CONSTRAINT chart_access_log_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: chart_access_log chart_access_log_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_access_log
    ADD CONSTRAINT chart_access_log_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: chart_access_log chart_access_log_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_access_log
    ADD CONSTRAINT chart_access_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: clinic_billing_rates clinic_billing_rates_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_rates
    ADD CONSTRAINT clinic_billing_rates_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_departments clinic_departments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments
    ADD CONSTRAINT clinic_departments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_lab_capabilities clinic_lab_capabilities_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_capabilities
    ADD CONSTRAINT clinic_lab_capabilities_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_lab_capabilities clinic_lab_capabilities_last_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_capabilities
    ADD CONSTRAINT clinic_lab_capabilities_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES public.staff(id);


--
-- Name: clinic_pharmacy_formulary clinic_pharmacy_formulary_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_formulary
    ADD CONSTRAINT clinic_pharmacy_formulary_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_pharmacy_formulary clinic_pharmacy_formulary_last_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_formulary
    ADD CONSTRAINT clinic_pharmacy_formulary_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES public.staff(id);


--
-- Name: clinic_pharmacy_formulary clinic_pharmacy_formulary_medication_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_formulary
    ADD CONSTRAINT clinic_pharmacy_formulary_medication_code_fkey FOREIGN KEY (medication_code) REFERENCES public.medication_catalog(code);


--
-- Name: clinic_print_settings clinic_print_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_print_settings
    ADD CONSTRAINT clinic_print_settings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_protocol_enrollments clinic_protocol_enrollments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_protocol_enrollments
    ADD CONSTRAINT clinic_protocol_enrollments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: clinic_protocol_enrollments clinic_protocol_enrollments_protocol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_protocol_enrollments
    ADD CONSTRAINT clinic_protocol_enrollments_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.clinical_protocol_definitions(id) ON DELETE CASCADE;


--
-- Name: cme_flashcards cme_flashcards_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_flashcards
    ADD CONSTRAINT cme_flashcards_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.cme_modules(id) ON DELETE CASCADE;


--
-- Name: cme_lessons cme_lessons_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_lessons
    ADD CONSTRAINT cme_lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.cme_modules(id) ON DELETE CASCADE;


--
-- Name: cme_quiz_attempts cme_quiz_attempts_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_quiz_attempts
    ADD CONSTRAINT cme_quiz_attempts_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.cme_modules(id) ON DELETE CASCADE;


--
-- Name: cme_quiz_attempts cme_quiz_attempts_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_quiz_attempts
    ADD CONSTRAINT cme_quiz_attempts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: cme_quiz_questions cme_quiz_questions_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cme_quiz_questions
    ADD CONSTRAINT cme_quiz_questions_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.cme_modules(id) ON DELETE CASCADE;


--
-- Name: consult_messages consult_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_messages
    ADD CONSTRAINT consult_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.consult_threads(id) ON DELETE CASCADE;


--
-- Name: consult_threads consult_threads_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: consult_threads consult_threads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: consult_threads consult_threads_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: consult_threads consult_threads_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_threads
    ADD CONSTRAINT consult_threads_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: dispense_records dispense_records_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: dispense_records dispense_records_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.staff(id);


--
-- Name: dispense_records dispense_records_prescription_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_prescription_order_id_fkey FOREIGN KEY (prescription_order_id) REFERENCES public.prescription_orders(id) ON DELETE CASCADE;


--
-- Name: dispense_records dispense_records_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.pharmacy_stock_items(id) ON DELETE SET NULL;


--
-- Name: dispense_records dispense_records_stock_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_stock_movement_id_fkey FOREIGN KEY (stock_movement_id) REFERENCES public.pharmacy_stock_movements(id) ON DELETE SET NULL;


--
-- Name: dispense_records dispense_records_substitute_medication_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_substitute_medication_code_fkey FOREIGN KEY (substitute_medication_code) REFERENCES public.medication_catalog(code);


--
-- Name: dispense_records dispense_records_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispense_records
    ADD CONSTRAINT dispense_records_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: ebola_screenings ebola_screenings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebola_screenings
    ADD CONSTRAINT ebola_screenings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: ebola_screenings ebola_screenings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebola_screenings
    ADD CONSTRAINT ebola_screenings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: ebola_screenings ebola_screenings_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebola_screenings
    ADD CONSTRAINT ebola_screenings_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: hiv_care_enrollments hiv_care_enrollments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiv_care_enrollments
    ADD CONSTRAINT hiv_care_enrollments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: hiv_care_enrollments hiv_care_enrollments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiv_care_enrollments
    ADD CONSTRAINT hiv_care_enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: hiv_care_enrollments hiv_care_enrollments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiv_care_enrollments
    ADD CONSTRAINT hiv_care_enrollments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: hts_events hts_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: hts_events hts_events_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: hts_events hts_events_pregnancy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_pregnancy_id_fkey FOREIGN KEY (pregnancy_id) REFERENCES public.pregnancies(id) ON DELETE SET NULL;


--
-- Name: hts_events hts_events_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: hts_events hts_events_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hts_events
    ADD CONSTRAINT hts_events_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: iv_infusion_checks iv_infusion_checks_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusion_checks
    ADD CONSTRAINT iv_infusion_checks_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: iv_infusion_checks iv_infusion_checks_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusion_checks
    ADD CONSTRAINT iv_infusion_checks_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: iv_infusion_checks iv_infusion_checks_infusion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusion_checks
    ADD CONSTRAINT iv_infusion_checks_infusion_id_fkey FOREIGN KEY (infusion_id) REFERENCES public.iv_infusions(id) ON DELETE CASCADE;


--
-- Name: iv_infusion_checks iv_infusion_checks_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusion_checks
    ADD CONSTRAINT iv_infusion_checks_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: iv_infusions iv_infusions_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusions
    ADD CONSTRAINT iv_infusions_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: iv_infusions iv_infusions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusions
    ADD CONSTRAINT iv_infusions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: iv_infusions iv_infusions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusions
    ADD CONSTRAINT iv_infusions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: iv_infusions iv_infusions_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iv_infusions
    ADD CONSTRAINT iv_infusions_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.staff(id);


--
-- Name: lab_stock_items lab_stock_items_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_items
    ADD CONSTRAINT lab_stock_items_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: lab_stock_movements lab_stock_movements_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_movements
    ADD CONSTRAINT lab_stock_movements_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: lab_stock_movements lab_stock_movements_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_movements
    ADD CONSTRAINT lab_stock_movements_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: lab_stock_movements lab_stock_movements_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_movements
    ADD CONSTRAINT lab_stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.lab_stock_items(id) ON DELETE CASCADE;


--
-- Name: lab_stock_movements lab_stock_movements_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_stock_movements
    ADD CONSTRAINT lab_stock_movements_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: medical_corpus medical_corpus_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_corpus
    ADD CONSTRAINT medical_corpus_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.medical_documents(id) ON DELETE CASCADE;


--
-- Name: medication_administrations medication_administrations_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_administrations
    ADD CONSTRAINT medication_administrations_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: medication_administrations medication_administrations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_administrations
    ADD CONSTRAINT medication_administrations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: medication_administrations medication_administrations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_administrations
    ADD CONSTRAINT medication_administrations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.medication_orders(id) ON DELETE CASCADE;


--
-- Name: medication_administrations medication_administrations_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_administrations
    ADD CONSTRAINT medication_administrations_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: medication_orders medication_orders_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_orders
    ADD CONSTRAINT medication_orders_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: medication_orders medication_orders_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_orders
    ADD CONSTRAINT medication_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: medication_orders medication_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_orders
    ADD CONSTRAINT medication_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.staff(id);


--
-- Name: medication_orders medication_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_orders
    ADD CONSTRAINT medication_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: message_logs message_logs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_logs
    ADD CONSTRAINT message_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: message_logs message_logs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_logs
    ADD CONSTRAINT message_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: patient_notes patient_notes_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: patient_number_sequences patient_number_sequences_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_number_sequences
    ADD CONSTRAINT patient_number_sequences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: patient_vitals patient_vitals_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_vitals patient_vitals_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: patient_vitals patient_vitals_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: patients patients_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: payment_receipt_sequences payment_receipt_sequences_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipt_sequences
    ADD CONSTRAINT payment_receipt_sequences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: payments payments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: payments payments_collected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES public.staff(id);


--
-- Name: payments payments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;


--
-- Name: payments payments_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE RESTRICT;


--
-- Name: pharmacy_stock_batches pharmacy_stock_batches_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_batches
    ADD CONSTRAINT pharmacy_stock_batches_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: pharmacy_stock_batches pharmacy_stock_batches_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_batches
    ADD CONSTRAINT pharmacy_stock_batches_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.pharmacy_stock_items(id) ON DELETE CASCADE;


--
-- Name: pharmacy_stock_items pharmacy_stock_items_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_items
    ADD CONSTRAINT pharmacy_stock_items_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.pharmacy_stock_batches(id) ON DELETE SET NULL;


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_prescription_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_prescription_order_id_fkey FOREIGN KEY (prescription_order_id) REFERENCES public.prescription_orders(id) ON DELETE SET NULL;


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.pharmacy_stock_items(id) ON DELETE CASCADE;


--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_stock_movements
    ADD CONSTRAINT pharmacy_stock_movements_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: postnatal_observations postnatal_observations_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postnatal_observations
    ADD CONSTRAINT postnatal_observations_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: postnatal_observations postnatal_observations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postnatal_observations
    ADD CONSTRAINT postnatal_observations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: postnatal_observations postnatal_observations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postnatal_observations
    ADD CONSTRAINT postnatal_observations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: postnatal_observations postnatal_observations_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postnatal_observations
    ADD CONSTRAINT postnatal_observations_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: pregnancies pregnancies_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pregnancies
    ADD CONSTRAINT pregnancies_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: pregnancies pregnancies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pregnancies
    ADD CONSTRAINT pregnancies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: pregnancies pregnancies_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pregnancies
    ADD CONSTRAINT pregnancies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;


--
-- Name: prescription_orders prescription_orders_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: prescription_orders prescription_orders_medication_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_medication_code_fkey FOREIGN KEY (medication_code) REFERENCES public.medication_catalog(code);


--
-- Name: prescription_orders prescription_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.staff(id);


--
-- Name: prescription_orders prescription_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: prescription_orders prescription_orders_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_orders
    ADD CONSTRAINT prescription_orders_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: protocol_activations protocol_activations_activated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES public.staff(id);


--
-- Name: protocol_activations protocol_activations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: protocol_activations protocol_activations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: protocol_activations protocol_activations_protocol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.clinical_protocol_definitions(id);


--
-- Name: protocol_activations protocol_activations_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocol_activations
    ADD CONSTRAINT protocol_activations_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: provider_note_addendums provider_note_addendums_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: provider_note_addendums provider_note_addendums_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: provider_note_addendums provider_note_addendums_parent_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_parent_note_id_fkey FOREIGN KEY (parent_note_id) REFERENCES public.provider_notes(id) ON DELETE CASCADE;


--
-- Name: provider_note_addendums provider_note_addendums_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: provider_note_addendums provider_note_addendums_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_addendums
    ADD CONSTRAINT provider_note_addendums_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: provider_note_amendments provider_note_amendments_amended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_amendments
    ADD CONSTRAINT provider_note_amendments_amended_by_fkey FOREIGN KEY (amended_by) REFERENCES public.staff(id);


--
-- Name: provider_note_amendments provider_note_amendments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_amendments
    ADD CONSTRAINT provider_note_amendments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: provider_note_amendments provider_note_amendments_parent_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_amendments
    ADD CONSTRAINT provider_note_amendments_parent_note_id_fkey FOREIGN KEY (parent_note_id) REFERENCES public.provider_notes(id) ON DELETE CASCADE;


--
-- Name: provider_note_amendments provider_note_amendments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_note_amendments
    ADD CONSTRAINT provider_note_amendments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: provider_notes provider_notes_amended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_amended_by_fkey FOREIGN KEY (amended_by) REFERENCES public.staff(id);


--
-- Name: provider_notes provider_notes_cosigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_cosigned_by_fkey FOREIGN KEY (cosigned_by) REFERENCES public.staff(id);


--
-- Name: provider_notes provider_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: provider_notes provider_notes_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.staff(id);


--
-- Name: provider_notes provider_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;


--
-- Name: provider_notes provider_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff(id);


--
-- Name: provider_notes provider_notes_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: provider_notes provider_notes_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notes
    ADD CONSTRAINT provider_notes_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.staff(id);


--
-- Name: referrals referrals_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.staff(id);


--
-- Name: referrals referrals_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: staff staff_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: staff_invitations staff_invitations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: staff_invitations staff_invitations_invited_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_invited_by_staff_id_fkey FOREIGN KEY (invited_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: staff_onboarding_progress staff_onboarding_progress_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_onboarding_progress
    ADD CONSTRAINT staff_onboarding_progress_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: sync_operations sync_operations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_operations
    ADD CONSTRAINT sync_operations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: sync_operations sync_operations_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_operations
    ADD CONSTRAINT sync_operations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: tb_episodes tb_episodes_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_episodes
    ADD CONSTRAINT tb_episodes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: tb_episodes tb_episodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_episodes
    ADD CONSTRAINT tb_episodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);


--
-- Name: tb_episodes tb_episodes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_episodes
    ADD CONSTRAINT tb_episodes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: tb_preventive_treatment tb_preventive_treatment_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_preventive_treatment
    ADD CONSTRAINT tb_preventive_treatment_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: tb_preventive_treatment tb_preventive_treatment_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_preventive_treatment
    ADD CONSTRAINT tb_preventive_treatment_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: tb_preventive_treatment tb_preventive_treatment_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_preventive_treatment
    ADD CONSTRAINT tb_preventive_treatment_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: viral_load_tests viral_load_tests_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_load_tests
    ADD CONSTRAINT viral_load_tests_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: viral_load_tests viral_load_tests_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_load_tests
    ADD CONSTRAINT viral_load_tests_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.hiv_care_enrollments(id) ON DELETE SET NULL;


--
-- Name: viral_load_tests viral_load_tests_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_load_tests
    ADD CONSTRAINT viral_load_tests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: viral_load_tests viral_load_tests_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_load_tests
    ADD CONSTRAINT viral_load_tests_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.staff(id);


--
-- Name: visit_critical_alerts visit_critical_alerts_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_critical_alerts
    ADD CONSTRAINT visit_critical_alerts_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: visit_critical_alerts visit_critical_alerts_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_critical_alerts
    ADD CONSTRAINT visit_critical_alerts_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.staff(id);


--
-- Name: visit_critical_alerts visit_critical_alerts_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_critical_alerts
    ADD CONSTRAINT visit_critical_alerts_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: visit_diagnosis_codes visit_diagnosis_codes_coded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis_codes
    ADD CONSTRAINT visit_diagnosis_codes_coded_by_fkey FOREIGN KEY (coded_by) REFERENCES public.staff(id);


--
-- Name: visit_diagnosis_codes visit_diagnosis_codes_hmis_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis_codes
    ADD CONSTRAINT visit_diagnosis_codes_hmis_code_id_fkey FOREIGN KEY (hmis_code_id) REFERENCES public.hmis_diagnosis_codes(id);


--
-- Name: visit_diagnosis_codes visit_diagnosis_codes_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis_codes
    ADD CONSTRAINT visit_diagnosis_codes_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: visits visits_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE SET NULL;


--
-- Name: visits visits_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- Name: visits visits_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.staff(id);


--
-- Name: visits visits_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: visits visits_lab_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_lab_completed_by_fkey FOREIGN KEY (lab_completed_by) REFERENCES public.staff(id);


--
-- Name: visits visits_nurse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: visits visits_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;


--
-- Name: visits visits_pharmacy_order_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pharmacy_order_submitted_by_fkey FOREIGN KEY (pharmacy_order_submitted_by) REFERENCES public.staff(id);


--
-- Name: visits visits_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.staff(id);


--
-- Name: audit_logs Anyone can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: message_logs Staff can create clinic messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create clinic messages" ON public.message_logs FOR INSERT WITH CHECK ((patient_id IN ( SELECT patients.id
   FROM public.patients
  WHERE (patients.clinic_id = public.get_current_clinic_id()))));


--
-- Name: patient_notes Staff can create clinic patient notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create clinic patient notes" ON public.patient_notes FOR INSERT WITH CHECK ((visit_id IN ( SELECT visits.id
   FROM public.visits
  WHERE (visits.clinic_id = public.get_current_clinic_id()))));


--
-- Name: patients Staff can create clinic patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create clinic patients" ON public.patients FOR INSERT WITH CHECK ((clinic_id = public.get_current_clinic_id()));


--
-- Name: provider_notes Staff can create clinic provider notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create clinic provider notes" ON public.provider_notes FOR INSERT WITH CHECK ((visit_id IN ( SELECT visits.id
   FROM public.visits
  WHERE (visits.clinic_id = public.get_current_clinic_id()))));


--
-- Name: patient_notes Staff can update clinic patient notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update clinic patient notes" ON public.patient_notes FOR UPDATE USING ((visit_id IN ( SELECT visits.id
   FROM public.visits
  WHERE (visits.clinic_id = public.get_current_clinic_id()))));


--
-- Name: patients Staff can update clinic patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update clinic patients" ON public.patients FOR UPDATE USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: provider_notes Staff can update clinic provider notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update clinic provider notes" ON public.provider_notes FOR UPDATE USING ((visit_id IN ( SELECT visits.id
   FROM public.visits
  WHERE (visits.clinic_id = public.get_current_clinic_id()))));


--
-- Name: message_logs Staff can view clinic messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view clinic messages" ON public.message_logs FOR SELECT USING ((patient_id IN ( SELECT patients.id
   FROM public.patients
  WHERE (patients.clinic_id = public.get_current_clinic_id()))));


--
-- Name: audit_logs Staff can view own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own audit logs" ON public.audit_logs FOR SELECT USING (((actor_id = public.get_current_staff_id()) OR (resource_id IN ( SELECT visits.id
   FROM public.visits
  WHERE (visits.clinic_id = public.get_current_clinic_id())))));


--
-- Name: clinics Staff can view own clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own clinic" ON public.clinics FOR SELECT USING ((id = public.get_current_clinic_id()));


--
-- Name: admission_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admission_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_notes admission_notes_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_notes_select_clinic ON public.admission_notes FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: admission_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admission_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_observations admission_observations_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_observations_select_clinic ON public.admission_observations FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: admissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

--
-- Name: admissions admissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admissions_select ON public.admissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = admissions.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: ai_review_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_review_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_review_suggestions ai_review_suggestions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_review_suggestions_select ON public.ai_review_suggestions FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: anc_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anc_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: anc_contacts anc_contacts_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anc_contacts_select_clinic ON public.anc_contacts FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments appointments_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_select_clinic ON public.appointments FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_insert_policy ON public.audit_logs FOR INSERT WITH CHECK (false);


--
-- Name: audit_logs audit_logs_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select_policy ON public.audit_logs FOR SELECT USING ((public.is_admin() OR ((resource_type = ANY (ARRAY['visit'::text, 'provider_note'::text, 'patient_note'::text])) AND (resource_id IN ( SELECT v.id
   FROM public.visits v
  WHERE (v.clinic_id = public.get_current_clinic_id())
UNION
 SELECT pn.id
   FROM (public.provider_notes pn
     JOIN public.visits v ON ((v.id = pn.visit_id)))
  WHERE (v.clinic_id = public.get_current_clinic_id())
UNION
 SELECT pan.id
   FROM (public.patient_notes pan
     JOIN public.visits v ON ((v.id = pan.visit_id)))
  WHERE (v.clinic_id = public.get_current_clinic_id()))))));


--
-- Name: care_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: care_tasks care_tasks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY care_tasks_select ON public.care_tasks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = care_tasks.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: charges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

--
-- Name: charges charges_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY charges_select_clinic ON public.charges FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: chart_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chart_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_departments clinic_departments_read_same_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinic_departments_read_same_clinic ON public.clinic_departments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.clinic_id = clinic_departments.clinic_id) AND (staff.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (staff.is_active = true) AND (staff.deactivated_at IS NULL)))));


--
-- Name: clinic_lab_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_lab_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_lab_capabilities clinic_lab_capabilities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinic_lab_capabilities_select ON public.clinic_lab_capabilities FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: clinic_pharmacy_formulary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_pharmacy_formulary ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_pharmacy_formulary clinic_pharmacy_formulary_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinic_pharmacy_formulary_select ON public.clinic_pharmacy_formulary FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: clinic_print_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_print_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_protocol_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_protocol_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_protocol_enrollments clinic_protocol_enrollments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinic_protocol_enrollments_select ON public.clinic_protocol_enrollments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = clinic_protocol_enrollments.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: clinical_protocol_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_protocol_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_protocol_definitions clinical_protocol_definitions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinical_protocol_definitions_select ON public.clinical_protocol_definitions FOR SELECT USING ((active = true));


--
-- Name: clinics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_flashcards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cme_flashcards ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_flashcards cme_flashcards_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cme_flashcards_read ON public.cme_flashcards FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.cme_modules m
  WHERE ((m.id = cme_flashcards.module_id) AND (m.published = true)))));


--
-- Name: cme_lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cme_lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_lessons cme_lessons_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cme_lessons_read ON public.cme_lessons FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.cme_modules m
  WHERE ((m.id = cme_lessons.module_id) AND (m.published = true)))));


--
-- Name: cme_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cme_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_modules cme_modules_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cme_modules_read ON public.cme_modules FOR SELECT USING ((published = true));


--
-- Name: cme_quiz_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cme_quiz_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_quiz_attempts cme_quiz_attempts_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cme_quiz_attempts_own ON public.cme_quiz_attempts USING ((staff_id = ( SELECT staff.id
   FROM public.staff
  WHERE (staff.clerk_user_id = (auth.jwt() ->> 'sub'::text))
 LIMIT 1))) WITH CHECK ((staff_id = ( SELECT staff.id
   FROM public.staff
  WHERE (staff.clerk_user_id = (auth.jwt() ->> 'sub'::text))
 LIMIT 1)));


--
-- Name: cme_quiz_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cme_quiz_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: cme_quiz_questions cme_quiz_questions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cme_quiz_questions_read ON public.cme_quiz_questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.cme_modules m
  WHERE ((m.id = cme_quiz_questions.module_id) AND (m.published = true)))));


--
-- Name: consult_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consult_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: consult_messages consult_messages_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consult_messages_clinic ON public.consult_messages USING ((EXISTS ( SELECT 1
   FROM public.consult_threads t
  WHERE ((t.id = consult_messages.thread_id) AND (t.clinic_id = public.get_current_clinic_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.consult_threads t
  WHERE ((t.id = consult_messages.thread_id) AND (t.clinic_id = public.get_current_clinic_id())))));


--
-- Name: consult_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consult_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: consult_threads consult_threads_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consult_threads_clinic ON public.consult_threads USING ((clinic_id = public.get_current_clinic_id())) WITH CHECK ((clinic_id = public.get_current_clinic_id()));


--
-- Name: deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: deliveries deliveries_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_select_clinic ON public.deliveries FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: diocese_coordinators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diocese_coordinators ENABLE ROW LEVEL SECURITY;

--
-- Name: diocese_coordinators diocese_coordinators_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diocese_coordinators_select_self ON public.diocese_coordinators FOR SELECT USING ((clerk_user_id = (auth.jwt() ->> 'sub'::text)));


--
-- Name: dispense_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispense_records ENABLE ROW LEVEL SECURITY;

--
-- Name: dispense_records dispense_records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dispense_records_select ON public.dispense_records FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: ebola_screenings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ebola_screenings ENABLE ROW LEVEL SECURITY;

--
-- Name: ebola_screenings ebola_screenings_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ebola_screenings_select_clinic ON public.ebola_screenings FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: hiv_care_enrollments hiv_care_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hiv_care_clinic ON public.hiv_care_enrollments USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = hiv_care_enrollments.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: hiv_care_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hiv_care_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: hmis_106a_elements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hmis_106a_elements ENABLE ROW LEVEL SECURITY;

--
-- Name: hmis_106a_elements hmis_106a_elements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hmis_106a_elements_read ON public.hmis_106a_elements FOR SELECT USING (true);


--
-- Name: hmis_diagnosis_codes hmis_codes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hmis_codes_read ON public.hmis_diagnosis_codes FOR SELECT USING (true);


--
-- Name: hmis_diagnosis_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hmis_diagnosis_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: hts_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hts_events ENABLE ROW LEVEL SECURITY;

--
-- Name: hts_events hts_events_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hts_events_clinic ON public.hts_events USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = hts_events.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: iv_infusion_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iv_infusion_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: iv_infusion_checks iv_infusion_checks_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iv_infusion_checks_select_clinic ON public.iv_infusion_checks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = iv_infusion_checks.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: iv_infusions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iv_infusions ENABLE ROW LEVEL SECURITY;

--
-- Name: iv_infusions iv_infusions_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iv_infusions_select_clinic ON public.iv_infusions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = iv_infusions.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: lab_stock_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_stock_items ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_stock_items lab_stock_items_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_stock_items_select_clinic ON public.lab_stock_items FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: lab_stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_stock_movements lab_stock_movements_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_stock_movements_select_clinic ON public.lab_stock_movements FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: lab_test_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_test_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_test_catalog lab_test_catalog_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_test_catalog_select ON public.lab_test_catalog FOR SELECT TO authenticated USING (true);


--
-- Name: medical_corpus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_corpus ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_corpus medical_corpus_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY medical_corpus_public_select ON public.medical_corpus FOR SELECT USING ((document_id IN ( SELECT medical_documents.id
   FROM public.medical_documents
  WHERE (medical_documents.is_published = true))));


--
-- Name: medical_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_documents medical_documents_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY medical_documents_public_select ON public.medical_documents FOR SELECT USING ((is_published = true));


--
-- Name: medication_administrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_administrations ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_administrations medication_administrations_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY medication_administrations_select_clinic ON public.medication_administrations FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: medication_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_orders medication_orders_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY medication_orders_select_clinic ON public.medication_orders FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: message_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_notes patient_notes_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_notes_insert_policy ON public.patient_notes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.visits v
  WHERE ((v.id = patient_notes.visit_id) AND (v.clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = 'doctor'::text))))));


--
-- Name: patient_notes patient_notes_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_notes_select_policy ON public.patient_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.visits v
  WHERE ((v.id = patient_notes.visit_id) AND (v.clinic_id = public.get_current_clinic_id())))));


--
-- Name: patient_notes patient_notes_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_notes_update_policy ON public.patient_notes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.visits v
  WHERE ((v.id = patient_notes.visit_id) AND (v.clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = 'doctor'::text))))));


--
-- Name: patient_vitals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_vitals patient_vitals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_vitals_select ON public.patient_vitals FOR SELECT USING ((patient_id IN ( SELECT patients.id
   FROM public.patients
  WHERE (patients.clinic_id = public.get_current_clinic_id()))));


--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

--
-- Name: patients patients_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_insert_policy ON public.patients FOR INSERT WITH CHECK ((clinic_id = public.get_current_clinic_id()));


--
-- Name: patients patients_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_select_policy ON public.patients FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: patients patients_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_update_policy ON public.patients FOR UPDATE USING (((clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = 'doctor'::text))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_insert_policy ON public.payments FOR INSERT WITH CHECK ((clinic_id = public.get_current_clinic_id()));


--
-- Name: payments payments_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_select_policy ON public.payments FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: payments payments_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_update_policy ON public.payments FOR UPDATE USING (((clinic_id = public.get_current_clinic_id()) AND public.is_admin()));


--
-- Name: pharmacy_stock_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pharmacy_stock_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_stock_batches pharmacy_stock_batches_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pharmacy_stock_batches_select_clinic ON public.pharmacy_stock_batches FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: pharmacy_stock_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pharmacy_stock_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_stock_items pharmacy_stock_items_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pharmacy_stock_items_select_clinic ON public.pharmacy_stock_items FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: pharmacy_stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pharmacy_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_stock_movements pharmacy_stock_movements_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pharmacy_stock_movements_select_clinic ON public.pharmacy_stock_movements FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: postnatal_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.postnatal_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: postnatal_observations postnatal_observations_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY postnatal_observations_select_clinic ON public.postnatal_observations FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: pregnancies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pregnancies ENABLE ROW LEVEL SECURITY;

--
-- Name: pregnancies pregnancies_select_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pregnancies_select_clinic ON public.pregnancies FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: prescription_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescription_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: prescription_orders prescription_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prescription_orders_select ON public.prescription_orders FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: protocol_activations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.protocol_activations ENABLE ROW LEVEL SECURITY;

--
-- Name: protocol_activations protocol_activations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY protocol_activations_select ON public.protocol_activations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = protocol_activations.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: provider_note_addendums; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_note_addendums ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_note_addendums provider_note_addendums_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_note_addendums_select ON public.provider_note_addendums FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: provider_note_amendments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_note_amendments ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_note_amendments provider_note_amendments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_note_amendments_select ON public.provider_note_amendments FOR SELECT TO authenticated USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: provider_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_notes provider_notes_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_notes_insert_policy ON public.provider_notes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.visits v
  WHERE ((v.id = provider_notes.visit_id) AND (v.clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = 'doctor'::text))))));


--
-- Name: provider_notes provider_notes_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_notes_select_policy ON public.provider_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.patients p
     JOIN public.staff s ON ((s.clinic_id = p.clinic_id)))
  WHERE ((p.id = provider_notes.patient_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: provider_notes provider_notes_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_notes_update_policy ON public.provider_notes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.visits v
  WHERE ((v.id = provider_notes.visit_id) AND (v.clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = 'doctor'::text))))));


--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: region_protocols; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.region_protocols ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_print_settings service role full access clinic_print_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role full access clinic_print_settings" ON public.clinic_print_settings TO service_role USING (true) WITH CHECK (true);


--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_invitations staff_invitations_read_same_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_invitations_read_same_clinic ON public.staff_invitations FOR SELECT USING (((clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (public.get_current_staff_role() = ANY (ARRAY['doctor'::text, 'clinical_officer'::text, 'midwife'::text])))));


--
-- Name: staff staff_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_select_policy ON public.staff FOR SELECT USING (((clinic_id = public.get_current_clinic_id()) OR (clerk_user_id = (auth.jwt() ->> 'sub'::text))));


--
-- Name: staff staff_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_update_policy ON public.staff FOR UPDATE USING ((public.is_admin() AND (clinic_id = public.get_current_clinic_id())));


--
-- Name: superadmins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmins superadmins_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY superadmins_select_self ON public.superadmins FOR SELECT USING ((clerk_user_id = (auth.jwt() ->> 'sub'::text)));


--
-- Name: sync_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: tb_episodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tb_episodes ENABLE ROW LEVEL SECURITY;

--
-- Name: tb_episodes tb_episodes_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tb_episodes_clinic ON public.tb_episodes USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = tb_episodes.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: tb_preventive_treatment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tb_preventive_treatment ENABLE ROW LEVEL SECURITY;

--
-- Name: tb_preventive_treatment tpt_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpt_clinic ON public.tb_preventive_treatment USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = tb_preventive_treatment.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: viral_load_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.viral_load_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_critical_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visit_critical_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_critical_alerts visit_critical_alerts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_critical_alerts_select ON public.visit_critical_alerts FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: visit_diagnosis_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visit_diagnosis_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_diagnosis_codes visit_dx_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_dx_delete ON public.visit_diagnosis_codes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.visits v
     JOIN public.staff s ON ((s.clinic_id = v.clinic_id)))
  WHERE ((v.id = visit_diagnosis_codes.visit_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: visit_diagnosis_codes visit_dx_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_dx_insert ON public.visit_diagnosis_codes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.visits v
     JOIN public.staff s ON ((s.clinic_id = v.clinic_id)))
  WHERE ((v.id = visit_diagnosis_codes.visit_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: visit_diagnosis_codes visit_dx_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_dx_read ON public.visit_diagnosis_codes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.visits v
     JOIN public.staff s ON ((s.clinic_id = v.clinic_id)))
  WHERE ((v.id = visit_diagnosis_codes.visit_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- Name: visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: visits visits_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_insert_policy ON public.visits FOR INSERT WITH CHECK ((clinic_id = public.get_current_clinic_id()));


--
-- Name: visits visits_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_select_policy ON public.visits FOR SELECT USING ((clinic_id = public.get_current_clinic_id()));


--
-- Name: visits visits_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_update_policy ON public.visits FOR UPDATE USING (((clinic_id = public.get_current_clinic_id()) AND (public.is_admin() OR (doctor_id = public.get_current_staff_id()))));


--
-- Name: viral_load_tests vl_tests_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vl_tests_clinic ON public.viral_load_tests USING ((EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.clinic_id = viral_load_tests.clinic_id) AND (s.clerk_user_id = (auth.jwt() ->> 'sub'::text)) AND (s.is_active = true)))));


--
-- PostgreSQL database dump complete
--


