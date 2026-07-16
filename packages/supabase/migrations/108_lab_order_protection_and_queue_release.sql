-- 108_lab_order_protection_and_queue_release.sql
--
-- Fixes for two field-reported queue-lifecycle bugs (SSUNGA HC III, 2026-07):
--
-- LAB-1 — "patients sent to the laboratory disappear from the lab queue after
-- a few minutes."
--
--   The lab board is keyed on visits.tests_ordered + visits.lab_status
--   (apps/web/src/app/dashboard/lab/page.tsx:45-48 filters
--   lab_status IN ('pending','running') AND tests_ordered non-empty).
--   A lab order lands there via rpc_submit_lab_order (105) or the web
--   submitLabOrder action, both of which set tests_ordered + lab_status='pending'.
--
--   But the note-summary write paths CLOBBER those columns from the note
--   editor's snapshot:
--
--     - rpc_upsert_visit_clinical_summary (037:39-44) sets
--       tests_ordered = NULLIF(TRIM(p_tests_ordered),'') and resets
--       lab_status to 'not_ordered' whenever the note's "tests" section is
--       empty. The web note editor autosaves through this RPC on a 1.5 s
--       debounce (PendingDictationCard.tsx:67,150) with a sections snapshot
--       seeded at page load (VisitDetailClient.tsx:167). Order labs from the
--       embedded catalog panel (or from the tablet) while the editor is open,
--       and the very next keystroke's autosave erases the order — the patient
--       vanishes from the bench and rpc_record_lab_test_result starts raising
--       'Test not found on visit'.
--     - rpc_finalize_clinical_encounter (102:221-241) does the same at sign
--       time.
--     - rpc_submit_lab_order (105:58-64) overwrites tests_ordered wholesale
--       with the client's local list, so a stale offline replay can drop
--       tests added meanwhile from another surface, and its
--       lab_test_results = COALESCE(p, existing) can overwrite
--       bench-recorded results with a stale client array.
--
--   Fix: once a lab order exists it can only be EXTENDED by the note/order
--   paths, never erased. merge_tests_ordered() unions the incoming list into
--   the existing one; lab_status is never reset to 'not_ordered' while tests
--   exist and only moves not_ordered→pending (or done/abnormal→pending when
--   genuinely new tests arrive). Removing/cancelling an ordered test is a lab
--   surface concern, deliberately NOT reachable from the note editor.
--
-- QUEUE-1 — "completed patients still remain in the Waiting queue."
--
--   Migration 102 routes queue auto-completion through
--   maybe_complete_visit_queue(), appended to the RPC write paths. But the
--   web Sign flow (signClinicianNote, apps/web/src/app/dashboard/visits/[id]/
--   note-actions.ts:311-331) sets documentation_complete = TRUE via a RAW
--   service-role table UPDATE — no RPC, so maybe_complete_visit_queue never
--   runs and the visit sits at queue_status='waiting' all day
--   (get_clinic_queue, 095, only excludes 'completed'/'cancelled').
--
--   Fix: an AFTER UPDATE OF (documentation_complete, lab_status,
--   dispensing_status) trigger on visits that PERFORMs
--   maybe_complete_visit_queue(NEW.id). This makes the 102 semantics hold for
--   EVERY write path — enumerated RPCs, raw service-role updates, and any
--   future path — instead of relying on call-site whack-a-mole. No recursion:
--   the helper's own UPDATE only touches queue_status/updated_at, which are
--   not in the trigger's column list.
--
-- Plus two one-time data heals (ordered: lab restore FIRST so restored
-- pending labs are not swept into 'completed'):
--   a. Re-derive tests_ordered/lab_status for visits whose order was wiped
--      but whose per-test rows survived in lab_test_results.
--   b. Release visits already stuck in the queue that satisfy the 102
--      done-or-absent conditions.
--
-- CANONICAL-BODY NOTE: rpc_finalize_clinical_encounter was previously defined
-- identically in 101 and 102 (see 102's commutation note). This migration
-- supersedes both; future edits to that function go HERE (and must keep 101's
-- gate-first replay ordering). Signatures of all re-created functions are
-- unchanged. Additive only; grants preserved/re-stated.

BEGIN;

-- =============================================================================
-- 1. merge_tests_ordered — union of two comma-separated test lists
-- =============================================================================
-- Existing order is preserved, incoming tests are appended, duplicate names
-- are dropped case-insensitively (first occurrence's casing wins). Returns
-- NULL when both inputs are empty — matching the "no order" representation
-- used by the lab board. Internal helper (called from SECURITY DEFINER RPCs
-- that already authorized the caller), mirroring maybe_complete_visit_queue's
-- no-explicit-GRANT pattern. TypeScript mirror: mergeTestsOrdered in
-- packages/shared/src/lab-queue.ts — keep the two in sync.

CREATE OR REPLACE FUNCTION merge_tests_ordered(p_existing TEXT, p_incoming TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH parts AS (
    SELECT TRIM(u.val) AS name, u.ord
    FROM unnest(
      string_to_array(COALESCE(p_existing, '') || ',' || COALESCE(p_incoming, ''), ',')
    ) WITH ORDINALITY AS u(val, ord)
    WHERE TRIM(u.val) <> ''
  ),
  dedup AS (
    SELECT DISTINCT ON (LOWER(name)) name, ord
    FROM parts
    ORDER BY LOWER(name), ord
  )
  SELECT NULLIF(string_agg(name, ', ' ORDER BY ord), '') FROM dedup;
$$;

-- =============================================================================
-- 2. merge_lab_test_results — server rows win, new tests append
-- =============================================================================
-- Used by rpc_submit_lab_order so a stale offline replay can never overwrite
-- bench-recorded per-test rows: for any test name already present on the
-- server (case-insensitive), the SERVER row is kept; incoming rows are only
-- appended for tests the server has never seen.

CREATE OR REPLACE FUNCTION merge_lab_test_results(p_existing JSONB, p_incoming JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH existing AS (
    SELECT e.elem, LOWER(TRIM(e.elem->>'test')) AS test_key, e.ord
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(COALESCE(p_existing, '[]'::jsonb)) = 'array'
           THEN COALESCE(p_existing, '[]'::jsonb) ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(elem, ord)
  ),
  incoming AS (
    SELECT i.elem, LOWER(TRIM(i.elem->>'test')) AS test_key, i.ord
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(COALESCE(p_incoming, '[]'::jsonb)) = 'array'
           THEN COALESCE(p_incoming, '[]'::jsonb) ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS i(elem, ord)
  )
  SELECT COALESCE(jsonb_agg(m.elem ORDER BY m.grp, m.ord), '[]'::jsonb)
  FROM (
    SELECT elem, 0 AS grp, ord FROM existing
    UNION ALL
    SELECT i.elem, 1 AS grp, i.ord FROM incoming i
    WHERE NOT EXISTS (SELECT 1 FROM existing e WHERE e.test_key = i.test_key)
  ) m;
$$;

-- =============================================================================
-- 3. rpc_upsert_visit_clinical_summary — note path can only ADD lab tests
-- =============================================================================
-- Base: 037. Auth guards and provider_notes update byte-identical. Changes:
--   - tests_ordered: merge_tests_ordered(existing, note) — never cleared.
--   - lab_status: not_ordered→pending when tests exist; done/abnormal→pending
--     only when the merge introduced genuinely NEW tests; NEVER back to
--     'not_ordered' while tests exist (the LAB-1 clobber).

CREATE OR REPLACE FUNCTION rpc_upsert_visit_clinical_summary(
  p_visit_id UUID,
  p_diagnosis TEXT DEFAULT NULL,
  p_medications TEXT DEFAULT NULL,
  p_follow_up_instructions TEXT DEFAULT NULL,
  p_tests_ordered TEXT DEFAULT NULL,
  p_structured_data TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
  v_structured_json JSONB;
  v_existing_tests TEXT;
  v_merged_tests TEXT;
  v_normalized_existing TEXT;
BEGIN
  SELECT clinic_id, tests_ordered
    INTO v_visit_clinic, v_existing_tests
    FROM visits WHERE id = p_visit_id;
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

  v_merged_tests := merge_tests_ordered(v_existing_tests, p_tests_ordered);
  v_normalized_existing := merge_tests_ordered(v_existing_tests, NULL);

  UPDATE visits
  SET diagnosis = NULLIF(TRIM(p_diagnosis), ''),
      medications = NULLIF(TRIM(p_medications), ''),
      follow_up_instructions = NULLIF(TRIM(p_follow_up_instructions), ''),
      tests_ordered = v_merged_tests,
      lab_status = CASE
        WHEN v_merged_tests IS NULL THEN lab_status
        WHEN lab_status = 'not_ordered' THEN 'pending'
        WHEN lab_status IN ('done', 'abnormal')
             AND v_merged_tests IS DISTINCT FROM v_normalized_existing THEN 'pending'
        ELSE lab_status
      END,
      updated_at = NOW()
  WHERE id = p_visit_id;

  UPDATE provider_notes
  SET structured_data = COALESCE(v_structured_json, structured_data),
      updated_at = NOW()
  WHERE visit_id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_upsert_visit_clinical_summary(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

-- =============================================================================
-- 4. rpc_finalize_clinical_encounter — same lab guard at sign time
-- =============================================================================
-- Base: 102 (== 101, gate-first replay ordering preserved). Only the
-- tests_ordered / lab_status assignments changed, exactly as in section 3.

CREATE OR REPLACE FUNCTION rpc_finalize_clinical_encounter(
  p_note_id UUID,
  p_visit_id UUID,
  p_patient_id UUID,
  p_transcript TEXT,
  p_patient_summary TEXT,
  p_diagnosis TEXT DEFAULT NULL,
  p_medications TEXT DEFAULT NULL,
  p_follow_up_instructions TEXT DEFAULT NULL,
  p_tests_ordered TEXT DEFAULT NULL,
  p_structured_data TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_staff_id UUID;
  v_mid_level BOOLEAN;
  v_structured_json JSONB;
  v_summary_id UUID;
  v_existing_tests TEXT;
  v_merged_tests TEXT;
  v_normalized_existing TEXT;
BEGIN
  SELECT clinic_id, tests_ordered
    INTO v_clinic_id, v_existing_tests
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
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can finalize encounters; role: %', v_role;
  END IF;

  IF p_patient_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found or clinic mismatch';
  END IF;

  -- COALESCE hardening (new in 108): under a trusted service-role/direct
  -- session get_current_staff_role() returns NULL, so `NULL IN (...)` made
  -- v_mid_level NULL and the provider_notes insert violated the
  -- requires_cosign NOT NULL constraint — the dormant web service-role
  -- finalize path could never succeed. Clerk-authenticated callers are
  -- unaffected (v_role is non-NULL for them).
  v_mid_level := COALESCE(v_role IN ('nurse', 'nursing_assistant'), FALSE);

  IF p_structured_data IS NOT NULL AND TRIM(p_structured_data) <> '' THEN
    v_structured_json := p_structured_data::jsonb;
  END IF;

  v_merged_tests := merge_tests_ordered(v_existing_tests, p_tests_ordered);
  v_normalized_existing := merge_tests_ordered(v_existing_tests, NULL);

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
      tests_ordered = v_merged_tests,
      lab_status = CASE
        WHEN v_merged_tests IS NULL THEN lab_status
        WHEN lab_status = 'not_ordered' THEN 'pending'
        WHEN lab_status IN ('done', 'abnormal')
             AND v_merged_tests IS DISTINCT FROM v_normalized_existing THEN 'pending'
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_finalize_clinical_encounter(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- =============================================================================
-- 5. rpc_submit_lab_order — merge instead of overwrite
-- =============================================================================
-- Base: 105. Changes:
--   - tests_ordered: union of server + client lists (stale offline replays
--     can no longer drop tests added from another surface).
--   - lab_test_results: merged per test name, SERVER rows win — a stale
--     client array can no longer overwrite bench-recorded results.
--   - lab_status: a client can no longer downgrade to 'not_ordered' while
--     tests exist on the visit.

CREATE OR REPLACE FUNCTION rpc_submit_lab_order(
  p_visit_id UUID,
  p_tests_ordered TEXT,
  p_lab_status TEXT DEFAULT 'pending',
  p_lab_test_results JSONB DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_existing_tests TEXT;
  v_merged_tests TEXT;
BEGIN
  SELECT clinic_id, tests_ordered
    INTO v_clinic_id, v_existing_tests
    FROM visits WHERE id = p_visit_id;

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

  v_merged_tests := merge_tests_ordered(v_existing_tests, p_tests_ordered);

  UPDATE visits
  SET
    tests_ordered = v_merged_tests,
    lab_status = CASE
      WHEN v_merged_tests IS NOT NULL AND p_lab_status = 'not_ordered' THEN
        CASE WHEN lab_status = 'not_ordered' THEN 'pending' ELSE lab_status END
      ELSE p_lab_status
    END,
    lab_test_results = CASE
      WHEN p_lab_test_results IS NULL THEN lab_test_results
      ELSE merge_lab_test_results(lab_test_results, p_lab_test_results)
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, v_clinic_id, 'submit_lab_order', 'visits', p_visit_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_submit_lab_order(UUID, TEXT, TEXT, JSONB, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 6. Queue auto-complete trigger — closes the raw-update gap (QUEUE-1)
-- =============================================================================
-- Fires only when a write touches one of the three inputs of
-- maybe_complete_visit_queue AND the visit is documented + not already
-- terminal. The helper is idempotent, so the explicit PERFORM calls appended
-- by 102 double-firing with this trigger is a harmless no-op. No recursion:
-- the helper's UPDATE sets queue_status/updated_at only, which are not in the
-- OF-list below.

CREATE OR REPLACE FUNCTION visits_queue_autocomplete_tg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM maybe_complete_visit_queue(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS visits_queue_autocomplete ON visits;
CREATE TRIGGER visits_queue_autocomplete
  AFTER UPDATE OF documentation_complete, lab_status, dispensing_status ON visits
  FOR EACH ROW
  WHEN (
    COALESCE(NEW.documentation_complete, FALSE)
    AND NEW.queue_status IS DISTINCT FROM 'completed'
    AND NEW.queue_status IS DISTINCT FROM 'cancelled'
  )
  EXECUTE FUNCTION visits_queue_autocomplete_tg();

-- =============================================================================
-- 7a. Heal: restore lab orders wiped by the clobber where per-test rows survive
-- =============================================================================
-- A wiped order whose tests never had a bench action leaves no trace and
-- cannot be restored; where lab_test_results kept rows, rebuild tests_ordered
-- from them and re-derive the visit-level lab state (derive_visit_lab_state,
-- 075). Runs BEFORE 7b so restored pending labs keep their queue open.

UPDATE visits v
SET tests_ordered = sub.restored_tests,
    lab_status = sub.derived_status,
    lab_results = sub.derived_results,
    lab_abnormal = sub.derived_abnormal,
    updated_at = NOW()
FROM (
  SELECT
    x.id,
    (
      SELECT string_agg(t.e->>'test', ', ' ORDER BY t.ord)
      FROM jsonb_array_elements(x.lab_test_results) WITH ORDINALITY AS t(e, ord)
      WHERE TRIM(COALESCE(t.e->>'test', '')) <> ''
    ) AS restored_tests,
    d.lab_status AS derived_status,
    d.lab_results AS derived_results,
    d.lab_abnormal AS derived_abnormal
  FROM visits x,
       LATERAL derive_visit_lab_state(x.lab_test_results) AS d
  WHERE (x.tests_ordered IS NULL OR TRIM(x.tests_ordered) = '')
    AND jsonb_typeof(x.lab_test_results) = 'array'
    AND jsonb_array_length(x.lab_test_results) > 0
) sub
WHERE v.id = sub.id
  AND sub.restored_tests IS NOT NULL;

-- =============================================================================
-- 7b. Heal: release visits already stuck in the queue
-- =============================================================================
-- Set-based application of maybe_complete_visit_queue's exact conditions
-- (102:107-125) to every non-terminal visit — the QUEUE-1 backlog.

UPDATE visits
SET queue_status = 'completed',
    updated_at = NOW()
WHERE queue_status IS DISTINCT FROM 'completed'
  AND queue_status IS DISTINCT FROM 'cancelled'
  AND COALESCE(documentation_complete, FALSE)
  AND COALESCE(lab_status, 'not_ordered') IN ('not_ordered', 'done', 'abnormal')
  AND (
    dispensing_status = 'dispensed'
    OR (COALESCE(dispensing_status, 'not_started') = 'not_started'
        AND pharmacy_order_submitted_at IS NULL)
  );

COMMIT;
