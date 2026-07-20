-- =============================================================================
-- 113_pharmacy_mid_session_in_progress.sql
-- =============================================================================
--
-- Bug: dispensing the first med on a multi-line Rx flipped visits.dispensing_status
-- to `partial`, which drops the patient off "To dispense" mid-session before the
-- pharmacist finishes the remaining lines.
--
-- Root cause: aggregate_visit_dispensing_status returned `partial` as soon as ANY
-- line was dispensed/partial/oos, even while other lines were still
-- ordered/dispensing (open). pharmacy-tabs.ts already documented the intended
-- rule — a multi-line script stays on To dispense until it fully dispenses OR
-- acquires a genuine remaining balance with no open lines left.
--
-- Fix: prefer `in_progress` while v_open > 0. Only roll up to `partial` once
-- there are no open lines left but work remains (partially_dispensed balances
-- or mixed terminal outcomes).
-- =============================================================================

CREATE OR REPLACE FUNCTION aggregate_visit_dispensing_status(p_visit_id UUID)
RETURNS TEXT AS $$
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

  -- Mid-session: unattempted / still-dispensing lines remain → keep the visit on
  -- To dispense so the pharmacist can finish the rest of the Rx without chasing
  -- the patient under the Partial tab.
  IF v_open > 0 THEN
    RETURN 'in_progress';
  END IF;

  -- No open lines left: genuine partial balances or mixed terminal outcomes.
  IF v_dispensed > 0 OR v_partial > 0 OR v_oos > 0 THEN
    RETURN 'partial';
  END IF;

  IF v_needs_clar > 0 THEN
    RETURN 'in_progress';
  END IF;

  RETURN 'in_progress';
END;
$$ LANGUAGE plpgsql STABLE;
