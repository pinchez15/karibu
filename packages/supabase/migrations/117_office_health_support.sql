-- 117_office_health_support.sql
-- Karibu Office modules E and F (docs/karibu-office-spec.md §7.E, §7.F).
--
--   E. Clinic health: a nightly green / amber / red per live clinic, computed
--      from how much the clinic is actually using the EHR, plus alert rules
--      that become to-dos on the partner's home screen.
--   F. Support desk intake: clinic staff raise a request from inside the EHR;
--      it lands with the clinic's office, which can escalate to Karibu central.
--
-- Everything read from the EHR here is a COUNT or a TIMESTAMP. No patient row,
-- name, number or clinical value is selected.
--
-- "Last sync" in Phase 1 is approximated from server-side last-write times
-- (spec §7.D). A per-device heartbeat replaces it in Phase 2 (office.devices).

-- ============================================================================
-- 1. Health
-- ============================================================================

CREATE OR REPLACE FUNCTION office.compute_clinic_health(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_last TIMESTAMPTZ;
  v_hours INTEGER;
  v_active_7 INTEGER; v_active_30 INTEGER;
  v_reg_7 INTEGER; v_visits_7 INTEGER; v_visits_base INTEGER;
  v_recent NUMERIC; v_baseline NUMERIC; v_drop INTEGER := 0;
  v_training JSONB;
  v_untrained INTEGER;
  v_reasons TEXT[] := '{}';
  v_score TEXT := 'green';
  v_metrics JSONB;
  v_no_sync INTEGER := office.setting_int('alert_no_sync_hours', 48);
  v_drop_limit INTEGER := office.setting_int('alert_drop_pct', 50);
BEGIN
  SELECT GREATEST(
    (SELECT MAX(applied_at) FROM sync_operations WHERE clinic_id = p_clinic_id),
    (SELECT MAX(updated_at) FROM visits WHERE clinic_id = p_clinic_id),
    (SELECT MAX(created_at) FROM patients WHERE clinic_id = p_clinic_id)
  ) INTO v_last;
  v_hours := CASE WHEN v_last IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last)) / 3600)::INTEGER END;

  -- Staff who did anything: wrote from Android, or touched a visit.
  WITH acts AS (
    SELECT staff_id AS s, applied_at AS at FROM sync_operations WHERE clinic_id = p_clinic_id AND applied_at > NOW() - INTERVAL '30 days'
    UNION ALL SELECT doctor_id, updated_at FROM visits WHERE clinic_id = p_clinic_id AND updated_at > NOW() - INTERVAL '30 days'
    UNION ALL SELECT nurse_id, updated_at FROM visits WHERE clinic_id = p_clinic_id AND updated_at > NOW() - INTERVAL '30 days'
  )
  SELECT COUNT(DISTINCT s) FILTER (WHERE at > NOW() - INTERVAL '7 days'), COUNT(DISTINCT s)
    INTO v_active_7, v_active_30
  FROM acts WHERE s IS NOT NULL;

  SELECT COUNT(*) INTO v_reg_7 FROM patients
  WHERE clinic_id = p_clinic_id AND created_at > NOW() - INTERVAL '7 days';

  SELECT COUNT(*) FILTER (WHERE visit_date > CURRENT_DATE - 7),
         COUNT(*) FILTER (WHERE visit_date <= CURRENT_DATE - 7)
    INTO v_visits_7, v_visits_base
  FROM visits
  WHERE clinic_id = p_clinic_id AND visit_date > CURRENT_DATE - 21 AND visit_date <= CURRENT_DATE;

  -- Paper-fallback signal: the last 7 days against the 14 days before them.
  -- Only judged once the clinic has a real baseline (a visit a day or more).
  v_recent := v_visits_7 / 7.0;
  v_baseline := v_visits_base / 14.0;
  IF v_baseline >= 1 THEN
    v_drop := GREATEST(0, ROUND((1 - v_recent / v_baseline) * 100))::INTEGER;
  END IF;

  v_training := office.staff_training(p_clinic_id);
  v_untrained := (v_training->>'total')::INTEGER - (v_training->>'trained')::INTEGER;

  IF v_hours IS NULL OR v_hours >= v_no_sync THEN
    v_reasons := array_append(v_reasons, 'no_sync'); v_score := 'red';
  END IF;
  IF v_drop > v_drop_limit THEN
    v_reasons := array_append(v_reasons, 'usage_drop');
    IF v_score = 'green' THEN v_score := 'amber'; END IF;
  END IF;
  IF v_untrained > 0 THEN
    v_reasons := array_append(v_reasons, 'training_incomplete');
    IF v_score = 'green' THEN v_score := 'amber'; END IF;
  END IF;

  v_metrics := jsonb_build_object(
    'last_activity_at', v_last, 'hours_since_activity', v_hours,
    'active_staff_7d', v_active_7, 'active_staff_30d', v_active_30,
    'registrations_7d', v_reg_7, 'registrations_per_day', ROUND(v_reg_7 / 7.0, 1),
    'visits_7d', v_visits_7, 'visits_per_day', ROUND(v_recent, 1),
    'baseline_visits_per_day', ROUND(v_baseline, 1), 'drop_pct', v_drop,
    'training_pct', v_training->'pct', 'untrained', v_untrained, 'staff_total', v_training->'total',
    -- Phase 2 (device heartbeat) fills these in.
    'unsynced_queue_depth', NULL, 'devices', '[]'::jsonb);

  INSERT INTO office.clinic_health_daily (clinic_id, day, score, reasons, metrics)
  VALUES (p_clinic_id, CURRENT_DATE, v_score, v_reasons, v_metrics)
  ON CONFLICT (clinic_id, day) DO UPDATE
    SET score = EXCLUDED.score, reasons = EXCLUDED.reasons, metrics = EXCLUDED.metrics, computed_at = NOW();

  RETURN jsonb_build_object('score', v_score, 'reasons', to_jsonb(v_reasons), 'metrics', v_metrics);
END;
$$;

-- Opens an alert to-do, or refreshes its numbers if it is already open.
CREATE OR REPLACE FUNCTION office.raise_alert(
  p_office_id UUID, p_account_id UUID, p_kind TEXT, p_title TEXT, p_detail JSONB, p_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, detail, source, dedupe_key)
  VALUES (p_office_id, p_account_id, p_kind, p_title, p_detail, 'alert', p_key)
  ON CONFLICT (office_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL
  DO UPDATE SET detail = EXCLUDED.detail;
END;
$$;

-- Closes an alert whose condition has cleared, so the home screen stays true.
CREATE OR REPLACE FUNCTION office.clear_alert(p_office_id UUID, p_key TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
  UPDATE office.tasks SET status = 'done', closed_at = NOW(), closed_by = NULL
  WHERE office_id = p_office_id AND dedupe_key = p_key AND status = 'open' AND source = 'alert';
$$;

-- Health + alert rules for every provisioned clinic. Called by the nightly job.
CREATE OR REPLACE FUNCTION office.health_nightly()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  a RECORD;
  v_health JSONB;
  v_m JSONB;
  v_late INTEGER;
  v_staff RECORD;
  v_days INTEGER := office.setting_int('alert_training_days', 7);
  v_n INTEGER := 0;
BEGIN
  FOR a IN SELECT * FROM office.clinic_accounts WHERE clinic_id IS NOT NULL AND stage <> 'churned' LOOP
    PERFORM office.refresh_account_progress(a.id);

    -- Training follow-up applies before and after go-live.
    SELECT (SELECT COUNT(*) FROM staff s WHERE s.clinic_id = a.clinic_id AND s.is_active
              AND s.onboarding_completed_at IS NULL AND s.created_at < NOW() - make_interval(days => v_days))
         + (SELECT COUNT(*) FROM staff_invitations i WHERE i.clinic_id = a.clinic_id AND i.status = 'pending'
              AND i.created_at < NOW() - make_interval(days => v_days))
      INTO v_late;
    IF v_late > 0 THEN
      PERFORM office.raise_alert(a.office_id, a.id, 'training_incomplete', a.name, jsonb_build_object('n', v_late), 'training_incomplete:' || a.id);
    ELSE
      PERFORM office.clear_alert(a.office_id, 'training_incomplete:' || a.id);
    END IF;

    IF (SELECT stage FROM office.clinic_accounts WHERE id = a.id) NOT IN ('live', 'steady', 'billed') THEN
      CONTINUE;
    END IF;

    v_health := office.compute_clinic_health(a.clinic_id);
    v_m := v_health->'metrics';
    v_n := v_n + 1;

    IF v_health->'reasons' ? 'no_sync' THEN
      PERFORM office.raise_alert(a.office_id, a.id, 'no_sync', a.name,
        jsonb_build_object('hours', COALESCE((v_m->>'hours_since_activity')::INTEGER, 0)), 'no_sync:' || a.id);
    ELSE
      PERFORM office.clear_alert(a.office_id, 'no_sync:' || a.id);
    END IF;

    IF v_health->'reasons' ? 'usage_drop' THEN
      PERFORM office.raise_alert(a.office_id, a.id, 'usage_drop', a.name,
        jsonb_build_object('pct', (v_m->>'drop_pct')::INTEGER), 'usage_drop:' || a.id);
    ELSE
      PERFORM office.clear_alert(a.office_id, 'usage_drop:' || a.id);
    END IF;

    -- Someone joined a clinic that is already live: they need training follow-up.
    FOR v_staff IN
      SELECT s.id, s.display_name FROM staff s
      WHERE s.clinic_id = a.clinic_id AND s.is_active AND s.onboarding_completed_at IS NULL
        AND s.created_at > NOW() - INTERVAL '2 days'
        AND s.created_at > (SELECT MIN(at) FROM office.clinic_stage_events WHERE clinic_account_id = a.id AND to_stage = 'live')
    LOOP
      PERFORM office.raise_alert(a.office_id, a.id, 'new_staff', v_staff.display_name, '{}'::jsonb, 'new_staff:' || v_staff.id);
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- The clinic health page. Named in the spec as rpc_office_clinic_health.
CREATE OR REPLACE FUNCTION public.office_clinic_health(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_today JSONB;
BEGIN
  v_account := office.require_account(p_account_id);
  IF v_account.clinic_id IS NULL OR v_account.stage NOT IN ('live', 'steady', 'billed') THEN
    RETURN jsonb_build_object('live', FALSE);
  END IF;

  -- Fresh on open; the nightly job keeps the history.
  v_today := office.compute_clinic_health(v_account.clinic_id);

  RETURN jsonb_build_object(
    'live', TRUE,
    'score', v_today->'score', 'reasons', v_today->'reasons', 'metrics', v_today->'metrics',
    'thresholds', jsonb_build_object(
      'no_sync_hours', office.setting_int('alert_no_sync_hours', 48),
      'drop_pct', office.setting_int('alert_drop_pct', 50)),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', day, 'score', score) ORDER BY day)
      FROM office.clinic_health_daily WHERE clinic_id = v_account.clinic_id AND day > CURRENT_DATE - 14), '[]'::jsonb),
    'daily', (
      SELECT jsonb_agg(jsonb_build_object(
        'day', d::DATE,
        'visits', (SELECT COUNT(*) FROM visits v WHERE v.clinic_id = v_account.clinic_id AND v.visit_date = d::DATE),
        'registrations', (SELECT COUNT(*) FROM patients p WHERE p.clinic_id = v_account.clinic_id
                          AND p.created_at >= d AND p.created_at < d + INTERVAL '1 day')) ORDER BY d)
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') d),
    'training', office.staff_training(v_account.clinic_id)
  );
END;
$$;

-- ============================================================================
-- 2. Support desk
-- ============================================================================

-- Raised from inside the EHR ("Get help"). Android calls this with the staff
-- member's own token; the EHR web server calls it with the service role and
-- passes the staff member it has already authenticated.
CREATE OR REPLACE FUNCTION public.office_support_ticket_create(
  p_body TEXT, p_category TEXT DEFAULT NULL, p_context JSONB DEFAULT '{}'::jsonb,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_staff staff;
  v_account office.clinic_accounts;
  v_id UUID;
  v_body TEXT := trim(COALESCE(p_body, ''));
BEGIN
  IF karibu_is_service_role() THEN
    SELECT * INTO v_staff FROM staff WHERE id = p_staff_id AND is_active;
  ELSE
    SELECT * INTO v_staff FROM staff WHERE id = get_current_staff_id();
  END IF;
  IF v_staff.id IS NULL THEN RAISE EXCEPTION 'Staff context required' USING ERRCODE = '42501'; END IF;
  IF length(v_body) < 5 THEN RAISE EXCEPTION 'Describe the problem'; END IF;
  IF p_category IS NOT NULL AND p_category NOT IN ('how_to', 'bug', 'sync', 'printing', 'access', 'billing', 'other') THEN
    p_category := 'other';
  END IF;

  SELECT * INTO v_account FROM office.clinic_accounts
  WHERE clinic_id = v_staff.clinic_id AND stage <> 'churned' LIMIT 1;

  -- A clinic with no office goes straight to Karibu central.
  INSERT INTO office.support_tickets (office_id, clinic_account_id, clinic_id, raised_by_staff_id, channel, category, body, context,
                                      escalated_to_karibu, escalated_at)
  VALUES (v_account.office_id, v_account.id, v_staff.clinic_id, v_staff.id, 'app', p_category, left(v_body, 4000),
          COALESCE(p_context, '{}'::jsonb) - 'patient' - 'patient_id' - 'visit_id',
          v_account.id IS NULL, CASE WHEN v_account.id IS NULL THEN NOW() END)
  RETURNING id INTO v_id;

  IF v_account.id IS NOT NULL THEN
    INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, source, dedupe_key)
    VALUES (v_account.office_id, v_account.id, 'ticket', left(v_body, 80), 'system', 'ticket:' || v_id);
  END IF;
  RETURN jsonb_build_object('ticket_id', v_id, 'routed_to', CASE WHEN v_account.id IS NULL THEN 'karibu' ELSE 'office' END);
END;
$$;

CREATE OR REPLACE FUNCTION office.ticket_json(tk office.support_tickets)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', tk.id, 'office_id', tk.office_id, 'clinic_account_id', tk.clinic_account_id,
    'clinic_name', COALESCE((SELECT name FROM office.clinic_accounts WHERE id = tk.clinic_account_id),
                            (SELECT name FROM clinics WHERE id = tk.clinic_id)),
    'office_name', (SELECT name FROM office.offices WHERE id = tk.office_id),
    'raised_by', (SELECT jsonb_build_object('name', display_name, 'role', role) FROM staff WHERE id = tk.raised_by_staff_id),
    'channel', tk.channel, 'category', tk.category, 'body', tk.body, 'context', tk.context,
    'status', tk.status, 'escalated_to_karibu', tk.escalated_to_karibu, 'escalated_at', tk.escalated_at,
    'escalation_note', tk.escalation_note, 'resolution', tk.resolution,
    'created_at', tk.created_at, 'resolved_at', tk.resolved_at);
$$;

CREATE OR REPLACE FUNCTION office.require_ticket(p_ticket_id UUID)
RETURNS office.support_tickets
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_ticket office.support_tickets;
BEGIN
  SELECT * INTO v_ticket FROM office.support_tickets WHERE id = p_ticket_id;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ticket.office_id IS NULL THEN
    PERFORM office.require_central();
  ELSE
    PERFORM office.require_member(v_ticket.office_id);
  END IF;
  RETURN v_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_tickets_list(p_office_id UUID, p_open_only BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id);
  RETURN COALESCE((
    SELECT jsonb_agg(office.ticket_json(tk) ORDER BY tk.created_at DESC)
    FROM (SELECT * FROM office.support_tickets
          WHERE office_id = p_office_id AND (NOT p_open_only OR status IN ('open', 'in_progress'))
          ORDER BY created_at DESC LIMIT 100) tk), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_ticket_get(p_ticket_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_ticket office.support_tickets;
BEGIN
  v_ticket := office.require_ticket(p_ticket_id);
  RETURN office.ticket_json(v_ticket) || jsonb_build_object(
    'notes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('author_kind', author_kind, 'author_name', author_name, 'body', body, 'at', at) ORDER BY at)
      FROM office.support_ticket_notes WHERE ticket_id = p_ticket_id), '[]'::jsonb));
END;
$$;

-- One RPC for the three things a person does to a request: add a note, change
-- its status (with a resolution), or escalate it to Karibu central (L2).
CREATE OR REPLACE FUNCTION public.office_ticket_update(
  p_ticket_id UUID, p_note TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_escalate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_ticket office.support_tickets;
  v_sub TEXT := office.current_sub();
  v_central BOOLEAN := office.is_central();
  v_name TEXT;
  v_note TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
BEGIN
  v_ticket := office.require_ticket(p_ticket_id);
  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;
  IF p_escalate AND v_note IS NULL THEN
    RAISE EXCEPTION 'ESCALATION_NEEDS_NOTE' USING HINT = 'Say what you tried, so Karibu does not start from zero.';
  END IF;

  SELECT display_name INTO v_name FROM office.office_members
  WHERE office_id = v_ticket.office_id AND clerk_user_id = v_sub AND is_active;

  IF v_note IS NOT NULL THEN
    INSERT INTO office.support_ticket_notes (ticket_id, author_kind, author_sub, author_name, body)
    VALUES (p_ticket_id, CASE WHEN v_name IS NULL AND v_central THEN 'karibu' ELSE 'office' END, v_sub,
            COALESCE(v_name, 'Karibu'), left(v_note, 4000));
  END IF;

  UPDATE office.support_tickets SET
    status = COALESCE(p_status, CASE WHEN status = 'open' AND v_note IS NOT NULL THEN 'in_progress' ELSE status END),
    resolution = CASE WHEN p_status IN ('resolved', 'closed') THEN COALESCE(v_note, resolution) ELSE resolution END,
    resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN NOW()
                       WHEN p_status IN ('open', 'in_progress') THEN NULL ELSE resolved_at END,
    escalated_to_karibu = escalated_to_karibu OR p_escalate,
    escalated_at = CASE WHEN p_escalate AND NOT escalated_to_karibu THEN NOW() ELSE escalated_at END,
    escalation_note = CASE WHEN p_escalate THEN v_note ELSE escalation_note END,
    updated_at = NOW()
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  IF v_ticket.status IN ('resolved', 'closed') THEN
    UPDATE office.tasks SET status = 'done', closed_at = NOW(), closed_by = v_sub
    WHERE dedupe_key = 'ticket:' || p_ticket_id AND status = 'open';
  END IF;
  IF p_escalate THEN
    PERFORM office.audit(v_ticket.office_id, 'ticket.escalated', 'support_ticket', p_ticket_id);
  END IF;
  RETURN office.ticket_json(v_ticket);
END;
$$;

-- Karibu central's L2 queue: escalated requests, and requests from clinics with no office.
CREATE OR REPLACE FUNCTION public.office_admin_tickets()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_central();
  RETURN COALESCE((
    SELECT jsonb_agg(office.ticket_json(tk) ORDER BY tk.escalated_at DESC)
    FROM office.support_tickets tk
    WHERE tk.escalated_to_karibu AND tk.status IN ('open', 'in_progress')), '[]'::jsonb);
END;
$$;

SELECT office.apply_rpc_grants(
  p_anon => ARRAY['office_public_profile', 'office_public_slugs', 'office_readiness_form',
                  'office_readiness_submit', 'office_readiness_add_photo',
                  'office_storage_readiness_can_write'],
  p_service_only => ARRAY['office_capture_lead']
);
