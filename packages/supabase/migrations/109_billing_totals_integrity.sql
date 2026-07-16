-- =============================================================================
-- 109_billing_totals_integrity.sql — BILL-1 (payment totals wrong)
-- =============================================================================
--
-- Field report (SSUNGA HC III): "the payment calculations are not yet giving
-- the correct totals. The total paid and remaining balance do not appear
-- accurately." Root causes fixed here (tests: packages/supabase/tests/
-- billing_totals.sql — written failing first):
--
--   A. LAB CHARGES SILENTLY STOPPED. 077_billing_auto_charges.sql added
--      billing_charge_lab_test + billing_ensure_consultation_charge to
--      rpc_record_lab_test_result (077:252-253). 094_wp1_close_the_loops.sql
--      re-created the function WITHOUT those hooks (094:315-421), and every
--      later re-create (099, 101, 102:350-476 — the live body) carried the
--      hookless version forward. Since 094 deployed, recording a lab result
--      raises NO charge, so "Total bill" is understated, patients who paid
--      look prepaid/settled, and Remaining is wrong on the billing list, the
--      patient bill, and the printed receipt. Fix: re-create the function
--      (102 body verbatim, SAME signature) with the hooks restored.
--
--   B. SUBSTITUTION MISPRICING. billing_charge_pharmacy_line (092:91-102)
--      bills SUM(raw quantity_dispensed) × unit price of the ORIGINAL
--      medication_code. With PHARM-4/5 (106/107) a partial's remainder can be
--      dispensed as a DIFFERENT strength/drug (substitute_medication_code),
--      so raw units of mixed drugs were summed and priced at the original
--      drug (e.g. 8×250mg substituted for a 500mg order billed as
--      8 × price(500mg) — 2× overcharge). Fix: price each dispense record at
--      COALESCE(substitute_medication_code, po.medication_code) and sum the
--      per-record totals.
--
--   C. NO DB BACKSTOP AGAINST DOUBLE-COUNTED CHARGES. The idempotency of the
--      auto-charge helpers rests on EXISTS-then-INSERT guards (077:53-56,
--      092:110-134) with no unique constraint behind them — a concurrent pair
--      of dispense calls (PHARM-5 made multi-call dispensing routine) can
--      insert the consultation fee or the same pharmacy line twice, and
--      nothing ever surfaces it. Fix: dedupe any existing double-counted rows
--      (void the extras), add partial unique indexes, and make the helpers
--      insert with ON CONFLICT so a race degrades to a no-op instead of a
--      duplicate charge.
--
--   Also closed: the pre-092 charge-identity seam. Charges raised before 092
--   are keyed item_code = medication_code; 092+ keys item_code =
--   prescription_order_id. A partial billed pre-092 whose remainder lands
--   post-092 would MISS the existing row and insert a second, cumulative
--   charge (old 6-tab charge + new 10-tab charge for the same line). The
--   re-created billing_charge_pharmacy_line now adopts an unambiguous
--   legacy-keyed row (re-keys it to the order id) before deciding
--   insert-vs-update.
--
-- Additive only: no RPC signatures change; indexes and voids only.
-- Verified NOT broken (kept as regression tests): sequential partial +
-- remainder already converge to ONE charge (092 UPDATE with cumulative SUM);
-- repeated dispense calls do not duplicate the consultation fee sequentially;
-- rpc_patient_balance / rpc_billing_patient_balances arithmetic; the web
-- computeBalance util (apps/web/src/lib/billing-balance.ts).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Dedupe already-double-counted charges, keeping the best row per identity:
--    a manually corrected row wins, else the largest amount (the cumulative
--    one), else the earliest. Extras are VOIDED (soft) — never deleted — so
--    the audit trail and any printed receipts stay reconcilable.
-- -----------------------------------------------------------------------------

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY visit_id
           ORDER BY manually_adjusted DESC, amount_ugx DESC, created_at ASC, id
         ) AS rn
  FROM charges
  WHERE category = 'consultation' AND source = 'consultation'
    AND NOT voided AND visit_id IS NOT NULL
)
UPDATE charges c
SET voided = TRUE
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY visit_id, item_code
           ORDER BY manually_adjusted DESC, amount_ugx DESC, created_at ASC, id
         ) AS rn
  FROM charges
  WHERE category = 'pharmacy'
    AND NOT voided AND visit_id IS NOT NULL AND item_code IS NOT NULL
)
UPDATE charges c
SET voided = TRUE
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- -----------------------------------------------------------------------------
-- 2. Uniqueness backstops. Partial indexes so voided rows never block a
--    legitimate re-raise, and manual consultation lines (source = 'manual')
--    stay unconstrained.
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uniq_charges_auto_consultation_per_visit
  ON charges (visit_id)
  WHERE category = 'consultation' AND source = 'consultation'
    AND NOT voided AND visit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_charges_pharmacy_line_per_visit
  ON charges (visit_id, item_code)
  WHERE category = 'pharmacy'
    AND NOT voided AND visit_id IS NOT NULL AND item_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. billing_ensure_consultation_charge — same semantics as 077 (once per
--    visit, fee from clinic_billing_rates, 0-fee rows preserved per 092's
--    note) plus the ON CONFLICT backstop for concurrent callers.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing_ensure_consultation_charge(p_visit_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_fee INTEGER;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  -- Any active consultation-category charge on the visit (auto OR a manual,
  -- visit-linked one) suppresses the auto fee.
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
  )
  -- Race backstop (uniq_charges_auto_consultation_per_visit): a concurrent
  -- dispense/lab call that also passed the EXISTS check degrades to a no-op.
  ON CONFLICT (visit_id)
    WHERE category = 'consultation' AND source = 'consultation'
      AND NOT voided AND visit_id IS NOT NULL
  DO NOTHING;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. billing_charge_pharmacy_line — 092 semantics (one charge per line keyed
--    on prescription_order_id, cumulative across partial + remainder, sticky
--    manual edits) with three fixes:
--      * per-record substitute-aware pricing (root cause B);
--      * adoption of an unambiguous pre-092 medication_code-keyed row so the
--        remainder updates it instead of double-charging (identity seam);
--      * ON CONFLICT backstop on the insert (root cause C).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing_charge_pharmacy_line(
  p_visit_id UUID,
  p_prescription_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_po RECORD;
  v_qty NUMERIC;
  v_total INTEGER;
  v_has_substitution BOOLEAN;
  v_unit_price INTEGER;
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

  -- Bill what was actually handed over: each dispense record priced at ITS
  -- OWN medication (the substitute when one was used, else the prescribed
  -- drug). Raw dispensed units are the billable units — prescribed_equivalent
  -- stays a completion/guard concept (106), not a billing one.
  SELECT
    COALESCE(SUM(r.quantity_dispensed), 0),
    COALESCE(SUM(ROUND(
      billing_pharmacy_unit_price(
        v_visit.clinic_id,
        COALESCE(r.substitute_medication_code, v_po.medication_code)
      ) * r.quantity_dispensed
    )), 0)::INTEGER,
    COALESCE(BOOL_OR(
      r.substitute_medication_code IS NOT NULL
      AND r.substitute_medication_code IS DISTINCT FROM v_po.medication_code
    ), FALSE)
  INTO v_qty, v_total, v_has_substitution
  FROM dispense_records r
  WHERE r.prescription_order_id = p_prescription_order_id
    AND r.line_status IN ('dispensed', 'partially_dispensed')
    AND r.quantity_dispensed IS NOT NULL
    AND r.quantity_dispensed > 0;

  IF v_qty <= 0 THEN RETURN; END IF;

  -- D3 (092): identity is the prescription order id.
  v_item_code := v_po.id::text;

  -- A single blended unit price is meaningless once drugs were mixed; leave it
  -- NULL then (the bill line shows the authoritative total either way).
  v_unit_price := CASE
    WHEN v_has_substitution THEN NULL
    ELSE billing_pharmacy_unit_price(v_visit.clinic_id, v_po.medication_code)
  END;

  v_name := COALESCE(
    (SELECT generic_name FROM medication_catalog WHERE code = v_po.medication_code),
    v_po.free_text_name,
    'Medication'
  );
  v_desc := v_name
    || COALESCE(' × ' || v_qty::text || ' ' || COALESCE(v_po.quantity_unit, ''), '')
    || CASE WHEN v_has_substitution THEN ' (incl. substitution)' ELSE '' END;

  -- Identity seam: a charge raised before 092 is keyed on medication_code.
  -- When exactly one non-cancelled order on the visit carries that code (no
  -- ambiguity), re-key it to the order id so the cumulative UPDATE below finds
  -- it instead of inserting a second charge for the same line.
  IF v_po.medication_code IS NOT NULL THEN
    UPDATE charges
    SET item_code = v_item_code
    WHERE visit_id = p_visit_id AND category = 'pharmacy' AND NOT voided
      AND item_code = v_po.medication_code
      AND NOT EXISTS (
        SELECT 1 FROM charges c2
        WHERE c2.visit_id = p_visit_id AND c2.category = 'pharmacy'
          AND NOT c2.voided AND c2.item_code = v_item_code
      )
      AND (
        SELECT COUNT(*) FROM prescription_orders po2
        WHERE po2.visit_id = p_visit_id
          AND po2.medication_code = v_po.medication_code
          AND po2.status <> 'cancelled'
      ) = 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided
  ) THEN
    -- D4 (092): never overwrite a manually corrected amount.
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
    )
    -- Race backstop (uniq_charges_pharmacy_line_per_visit).
    ON CONFLICT (visit_id, item_code)
      WHERE category = 'pharmacy'
        AND NOT voided AND visit_id IS NOT NULL AND item_code IS NOT NULL
    DO NOTHING;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. rpc_record_lab_test_result — 102_queue_autocomplete.sql:350-476 body
--    reproduced verbatim, SAME signature, with the 077 billing hooks RESTORED
--    (root cause A). If you edit this RPC again, keep the two PERFORM
--    billing_* calls — they are the only thing that bills lab work.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_record_lab_test_result(
  p_visit_id UUID,
  p_test_name TEXT,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS VOID AS $$
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

  -- BILL-1 fix (root cause A): the 077 billing hooks, dropped by 094's
  -- re-create and missing from every later version. Both helpers are
  -- idempotent (guards + 109 unique indexes).
  PERFORM billing_charge_lab_test(p_visit_id, v_trimmed_test);
  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_record_lab_test_result(
  UUID, TEXT, TEXT, BOOLEAN, UUID, UUID
) TO anon, authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- NOT done here (needs a product decision, listed in the BILL-1 report):
--   * Backfilling lab charges for results recorded while the hooks were
--     missing (since 094). rpc_generate_charges_from_visit (078) already
--     backfills per visit via the "Add charges from visit" button, at
--     today's prices — a blanket backfill would silently grow patient
--     balances, so it is left to the front desk / an explicit ops script.
--   * Manual consultation charges added WITHOUT a visit link (web addCharge
--     with p_visit_id NULL) cannot suppress the per-visit auto fee — the
--     guard is visit-scoped by design. Front desk should void one of the two
--     if they double up; linking manual consultation lines to a visit in the
--     web form is the durable fix.
-- -----------------------------------------------------------------------------
