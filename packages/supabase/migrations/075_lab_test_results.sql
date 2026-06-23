-- 075_lab_test_results.sql
-- Per-test lab result tracking on visits. The bench records each ordered test
-- independently; visit-level lab_status / lab_results are derived summaries.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS lab_test_results JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN visits.lab_test_results IS
  'Array of {test, status, result, abnormal, started_at, completed_at} — one entry per test in tests_ordered.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION parse_tests_ordered(p_tests_ordered TEXT)
RETURNS TEXT[] AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT TRIM(t)
      FROM unnest(string_to_array(COALESCE(p_tests_ordered, ''), ',')) AS t
      WHERE TRIM(t) <> ''
    ),
    ARRAY[]::TEXT[]
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION sync_lab_test_results_array(
  p_tests_ordered TEXT,
  p_existing JSONB
) RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION derive_visit_lab_state(p_results JSONB)
RETURNS TABLE (
  lab_status TEXT,
  lab_results TEXT,
  lab_abnormal BOOLEAN,
  all_complete BOOLEAN
) AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION visit_has_open_lab_tests(p_results JSONB)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_results, '[]'::jsonb)) AS elem
    WHERE elem->>'status' IN ('pending', 'running')
  );
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- RPCs — per-test workflow (web bench)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_start_lab_test(
  p_visit_id UUID,
  p_test_name TEXT,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
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
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_record_lab_test_result(
  p_visit_id UUID,
  p_test_name TEXT,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_tests_ordered TEXT;
  v_results JSONB;
  v_trimmed_test TEXT;
  v_trimmed_result TEXT;
  v_i INT;
  v_elem JSONB;
  v_new_results JSONB := '[]'::jsonb;
  v_derived RECORD;
  v_status TEXT;
BEGIN
  v_trimmed_test := NULLIF(TRIM(p_test_name), '');
  v_trimmed_result := NULLIF(TRIM(p_result), '');
  IF v_trimmed_test IS NULL THEN RAISE EXCEPTION 'Test name cannot be empty'; END IF;
  IF v_trimmed_result IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  SELECT clinic_id, tests_ordered, lab_test_results
  INTO v_clinic_id, v_tests_ordered, v_results
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
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
    lab_completed_by = CASE WHEN v_derived.all_complete THEN get_current_staff_id() ELSE lab_completed_by END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_start_lab_test(UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_record_lab_test_result(UUID, TEXT, TEXT, BOOLEAN, UUID) TO anon, authenticated;

-- Backfill: seed per-test rows for visits already on the lab queue.
UPDATE visits
SET lab_test_results = sync_lab_test_results_array(tests_ordered, lab_test_results)
WHERE tests_ordered IS NOT NULL
  AND TRIM(tests_ordered) <> '';
