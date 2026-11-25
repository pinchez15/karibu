-- Karibu Office: cash flow inputs and portfolio analytics.
--
-- Adds what the desktop redesign needs and nothing else:
--   * office.costs and office.office_prefs: the partner's own monthly costs and
--     the balance they say is in their accounts. Karibu Office still never
--     moves or holds money (ADR-0002 §8); these are forecast inputs only.
--   * office_cashflow: open invoices, how long each clinic takes to pay, and
--     what was collected each month. The forecast itself is worked out in the app.
--   * office_analytics: weekly usage COUNTS across the office's live clinics,
--     the lead-to-live funnel, payment speed and support load, plus which
--     panels the partner has paused. Counts, timestamps and clinic names only.
--
-- Not included: a "quote sent" clinic stage. Stage ranks are compared
-- numerically across migrations 115-118, so a new stage needs its own migration.

-- ============================================================================
-- 1. Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.office_prefs (
  office_id UUID PRIMARY KEY REFERENCES office.offices(id) ON DELETE CASCADE,
  -- What the partner says is in their accounts. Entered by hand; never read from a bank.
  cash_balance BIGINT CHECK (cash_balance >= 0),
  cash_balance_at TIMESTAMPTZ,
  -- Analytics panels the partner has switched off: usage, staff, funnel, payments, support.
  analytics_paused TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office.costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('monthly', 'once')),
  -- First month the cost applies (monthly), or the month it falls in (once).
  starts_on DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  ends_on DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_costs_office ON office.costs (office_id, starts_on);

ALTER TABLE office.office_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE office.costs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Cash flow inputs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_cashflow(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'support']);
  RETURN jsonb_build_object(
    'balance', (
      SELECT jsonb_build_object('amount', cash_balance, 'at', cash_balance_at)
      FROM office.office_prefs WHERE office_id = p_office_id AND cash_balance IS NOT NULL),
    'costs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'label', c.label, 'amount', c.amount, 'currency', c.currency,
        'cadence', c.cadence, 'starts_on', c.starts_on, 'ends_on', c.ends_on) ORDER BY c.cadence, c.amount DESC, c.label)
      FROM office.costs c WHERE c.office_id = p_office_id), '[]'::jsonb),
    'open_invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'clinic_account_id', i.clinic_account_id,
        'clinic_name', (SELECT name FROM office.clinic_accounts WHERE id = i.clinic_account_id),
        'balance', i.amount - i.amount_paid, 'due_date', i.due_date, 'issue_date', i.issue_date) ORDER BY i.due_date)
      FROM office.invoices i
      WHERE i.office_id = p_office_id AND i.status IN ('sent', 'part_paid', 'overdue')), '[]'::jsonb),
    -- How long each clinic has taken to pay, from invoices that are fully paid.
    'pay_habits', COALESCE((
      SELECT jsonb_agg(h ORDER BY (h->>'avg_days')::NUMERIC DESC) FROM (
        SELECT jsonb_build_object(
          'clinic_account_id', a.id, 'clinic_name', a.name,
          'paid_invoices', COUNT(*), 'avg_days', ROUND(AVG(GREATEST(0, d.paid_on - i.issue_date)), 0)) AS h
        FROM office.invoices i
        JOIN office.clinic_accounts a ON a.id = i.clinic_account_id
        JOIN LATERAL (
          SELECT MAX(p.paid_at)::DATE AS paid_on FROM office.payments p
          WHERE p.invoice_id = i.id AND p.confirmed_at IS NOT NULL) d ON d.paid_on IS NOT NULL
        WHERE i.office_id = p_office_id AND i.status = 'paid'
        GROUP BY a.id, a.name) q), '[]'::jsonb),
    'collected_by_month', COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'month') FROM (
        SELECT jsonb_build_object(
          'month', to_char(date_trunc('month', p.paid_at), 'YYYY-MM-DD'), 'collected', SUM(p.amount)) AS m
        FROM office.payments p
        WHERE p.office_id = p_office_id AND p.confirmed_at IS NOT NULL
          AND p.paid_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY date_trunc('month', p.paid_at)) q), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.office_cash_balance_set(p_office_id UUID, p_amount BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING HINT = 'Enter the amount in your accounts, zero or more.';
  END IF;
  INSERT INTO office.office_prefs (office_id, cash_balance, cash_balance_at)
  VALUES (p_office_id, p_amount, NOW())
  ON CONFLICT (office_id) DO UPDATE
    SET cash_balance = EXCLUDED.cash_balance, cash_balance_at = NOW(), updated_at = NOW();
  RETURN jsonb_build_object('amount', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_cost_save(p_office_id UUID, p_fields JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_id UUID := NULLIF(p_fields->>'id', '')::UUID;
  v_label TEXT := NULLIF(trim(COALESCE(p_fields->>'label', '')), '');
  v_amount BIGINT := NULLIF(p_fields->>'amount', '')::BIGINT;
  v_cadence TEXT := COALESCE(NULLIF(p_fields->>'cadence', ''), 'monthly');
  v_starts DATE := COALESCE(NULLIF(p_fields->>'starts_on', '')::DATE, date_trunc('month', CURRENT_DATE)::DATE);
  v_ends DATE := NULLIF(p_fields->>'ends_on', '')::DATE;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  IF v_label IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_COST' USING HINT = 'A cost needs a name and an amount above zero.';
  END IF;
  IF v_cadence NOT IN ('monthly', 'once') THEN
    RAISE EXCEPTION 'INVALID_COST' USING HINT = 'A cost is monthly or one-off.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO office.costs (office_id, label, amount, currency, cadence, starts_on, ends_on, created_by)
    VALUES (p_office_id, v_label, v_amount, (SELECT currency FROM office.offices WHERE id = p_office_id),
            v_cadence, date_trunc('month', v_starts)::DATE, v_ends, office.current_sub())
    RETURNING id INTO v_id;
  ELSE
    UPDATE office.costs
       SET label = v_label, amount = v_amount, cadence = v_cadence,
           starts_on = date_trunc('month', v_starts)::DATE, ends_on = v_ends
     WHERE id = v_id AND office_id = p_office_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cost not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_cost_remove(p_cost_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_office UUID;
BEGIN
  SELECT office_id INTO v_office FROM office.costs WHERE id = p_cost_id;
  IF v_office IS NULL THEN RAISE EXCEPTION 'Cost not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM office.require_member(v_office, ARRAY['owner']);
  DELETE FROM office.costs WHERE id = p_cost_id;
  RETURN jsonb_build_object('removed', TRUE);
END;
$$;

-- ============================================================================
-- 3. Portfolio analytics
-- ============================================================================
-- Raw counts only. Whether a panel has enough data to show a trend is decided
-- in the app (apps/office/src/lib/analytics.ts), so the thresholds can change
-- without a migration and are covered by unit tests.

CREATE OR REPLACE FUNCTION public.office_analytics(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_clinics UUID[];
  v_week DATE := date_trunc('week', CURRENT_DATE)::DATE;
BEGIN
  PERFORM office.require_member(p_office_id);

  SELECT COALESCE(array_agg(clinic_id), '{}') INTO v_clinics
  FROM office.clinic_accounts
  WHERE office_id = p_office_id AND clinic_id IS NOT NULL AND stage IN ('live', 'steady', 'billed');

  RETURN jsonb_build_object(
    'paused', COALESCE((SELECT to_jsonb(analytics_paused) FROM office.office_prefs WHERE office_id = p_office_id), '[]'::jsonb),
    'live_clinics', COALESCE(array_length(v_clinics, 1), 0),
    'first_live_at', (
      SELECT MIN(at) FROM office.clinic_stage_events WHERE office_id = p_office_id AND to_stage = 'live'),

    -- The 12 complete weeks before this one. The current week is left out
    -- because a part week always looks like a drop.
    'weeks', (
      SELECT jsonb_agg(jsonb_build_object(
        'week', w::DATE,
        'visits', (SELECT COUNT(*) FROM visits v
                   WHERE v.clinic_id = ANY (v_clinics) AND v.visit_date >= w::DATE AND v.visit_date < w::DATE + 7),
        'clinics', (SELECT COUNT(DISTINCT v.clinic_id) FROM visits v
                    WHERE v.clinic_id = ANY (v_clinics) AND v.visit_date >= w::DATE AND v.visit_date < w::DATE + 7)) ORDER BY w)
      FROM generate_series(v_week - 84, v_week - 7, INTERVAL '1 week') w),

    -- From the latest nightly health snapshot of each live clinic.
    'staff', (
      SELECT jsonb_build_object(
        'clinics', COUNT(*),
        'with_account', COALESCE(SUM((h.metrics->>'staff_total')::INTEGER), 0),
        'active_7d', COALESCE(SUM((h.metrics->>'active_staff_7d')::INTEGER), 0),
        'as_of', MAX(h.day))
      FROM unnest(v_clinics) c(id)
      JOIN LATERAL (
        SELECT d.metrics, d.day FROM office.clinic_health_daily d
        WHERE d.clinic_id = c.id ORDER BY d.day DESC LIMIT 1) h ON TRUE),

    -- Clinics added in the last 90 days, by the furthest stage each reached.
    'funnel', (
      WITH cohort AS (
        SELECT GREATEST(
                 office.stage_rank(a.stage),
                 COALESCE((SELECT MAX(office.stage_rank(e.to_stage)) FROM office.clinic_stage_events e
                           WHERE e.clinic_account_id = a.id), 0)) AS top
        FROM office.clinic_accounts a
        WHERE a.office_id = p_office_id AND a.created_at > NOW() - INTERVAL '90 days')
      SELECT jsonb_build_object(
        'leads', COUNT(*),
        'contacted', COUNT(*) FILTER (WHERE top >= 2),
        'demo', COUNT(*) FILTER (WHERE top >= 3),
        'onboarding', COUNT(*) FILTER (WHERE top >= 4),
        'live', COUNT(*) FILTER (WHERE top >= 8))
      FROM cohort),
    'days_to_live', (
      SELECT jsonb_build_object(
        'clinics', COUNT(*),
        'median', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.live_at - a.created_at)) / 86400))::NUMERIC, 0))
      FROM office.clinic_accounts a
      JOIN LATERAL (
        SELECT MIN(e.at) AS live_at FROM office.clinic_stage_events e
        WHERE e.clinic_account_id = a.id AND e.to_stage = 'live') l ON l.live_at IS NOT NULL
      WHERE a.office_id = p_office_id AND l.live_at > NOW() - INTERVAL '365 days'),

    'payments', (
      SELECT jsonb_build_object(
        'paid_invoices', COUNT(*),
        'within_30', COUNT(*) FILTER (WHERE d.paid_on - i.issue_date <= 30),
        'median_days', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0, d.paid_on - i.issue_date)))::NUMERIC, 0))
      FROM office.invoices i
      JOIN LATERAL (
        SELECT MAX(p.paid_at)::DATE AS paid_on FROM office.payments p
        WHERE p.invoice_id = i.id AND p.confirmed_at IS NOT NULL) d ON d.paid_on IS NOT NULL
      WHERE i.office_id = p_office_id AND i.status = 'paid' AND i.issue_date > CURRENT_DATE - 180),

    'support', (
      SELECT jsonb_build_object(
        'requests', COUNT(*),
        'solved', COUNT(*) FILTER (WHERE tk.status IN ('resolved', 'closed')),
        'solved_alone', COUNT(*) FILTER (WHERE tk.status IN ('resolved', 'closed') AND NOT tk.escalated_to_karibu),
        'replied', COUNT(r.first_at),
        'median_reply_minutes', ROUND((percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (r.first_at - tk.created_at)) / 60) FILTER (WHERE r.first_at IS NOT NULL))::NUMERIC, 0))
      FROM office.support_tickets tk
      LEFT JOIN LATERAL (
        SELECT MIN(n.at) AS first_at FROM office.support_ticket_notes n
        WHERE n.ticket_id = tk.id AND n.author_kind = 'office') r ON TRUE
      WHERE tk.office_id = p_office_id AND tk.created_at > NOW() - INTERVAL '30 days'),

    'clinics', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'name') FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'name', a.name, 'district', a.district, 'tier', a.tier,
          'score', h.score,
          'visits_per_day', (h.metrics->>'visits_per_day')::NUMERIC,
          'baseline_visits_per_day', (h.metrics->>'baseline_visits_per_day')::NUMERIC,
          'active_staff_7d', (h.metrics->>'active_staff_7d')::INTEGER,
          'staff_total', (h.metrics->>'staff_total')::INTEGER,
          'avg_days_to_pay', (
            SELECT ROUND(AVG(GREATEST(0, d.paid_on - i.issue_date)), 0)
            FROM office.invoices i
            JOIN LATERAL (
              SELECT MAX(p.paid_at)::DATE AS paid_on FROM office.payments p
              WHERE p.invoice_id = i.id AND p.confirmed_at IS NOT NULL) d ON d.paid_on IS NOT NULL
            WHERE i.clinic_account_id = a.id AND i.status = 'paid'),
          'requests_30d', (
            SELECT COUNT(*) FROM office.support_tickets tk
            WHERE tk.clinic_account_id = a.id AND tk.created_at > NOW() - INTERVAL '30 days')) AS row
        FROM office.clinic_accounts a
        LEFT JOIN LATERAL (
          SELECT d.score, d.metrics FROM office.clinic_health_daily d
          WHERE d.clinic_id = a.clinic_id ORDER BY d.day DESC LIMIT 1) h ON TRUE
        WHERE a.office_id = p_office_id AND a.stage IN ('live', 'steady', 'billed')) q), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.office_analytics_pause(p_office_id UUID, p_panel TEXT, p_paused BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_paused TEXT[];
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  IF p_panel NOT IN ('usage', 'staff', 'funnel', 'payments', 'support') THEN
    RAISE EXCEPTION 'UNKNOWN_PANEL' USING HINT = 'That is not an analytics panel.';
  END IF;
  INSERT INTO office.office_prefs (office_id) VALUES (p_office_id) ON CONFLICT (office_id) DO NOTHING;
  UPDATE office.office_prefs
     SET analytics_paused = CASE
           WHEN p_paused THEN (SELECT array_agg(DISTINCT x) FROM unnest(analytics_paused || p_panel) x)
           ELSE array_remove(analytics_paused, p_panel) END,
         updated_at = NOW()
   WHERE office_id = p_office_id
  RETURNING analytics_paused INTO v_paused;
  RETURN jsonb_build_object('paused', to_jsonb(v_paused));
END;
$$;

-- ============================================================================
-- 4. Grants (every office migration ends here; ADR-0002 §3)
-- ============================================================================

SELECT office.apply_rpc_grants(
  p_anon => ARRAY['office_public_profile', 'office_public_slugs', 'office_readiness_form',
                  'office_readiness_submit', 'office_readiness_add_photo',
                  'office_storage_readiness_can_write', 'office_invoice_public'],
  p_service_only => ARRAY['office_capture_lead', 'office_run_nightly']
);
