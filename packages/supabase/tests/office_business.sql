-- Karibu Office cash flow inputs and analytics (migration 119).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/office_business.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_sub TEXT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_like THEN RAISE EXCEPTION 'expected error like "%", got "%" for: %', p_like, SQLERRM, p_sql; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error like "%" but statement succeeded: %', p_like, p_sql;
END $$;

INSERT INTO superadmins (clerk_user_id, email, display_name) VALUES ('user_central', 'central@test', 'Central');

CREATE TEMP TABLE ctx AS
WITH c AS (
  INSERT INTO clinics (name, slug, clerk_organization_id, created_at) VALUES ('Biz HC III', 'biz-hc', 'org_biz', NOW() - INTERVAL '90 days') RETURNING id
), s AS (
  INSERT INTO staff (clerk_user_id, clinic_id, email, display_name, role, onboarding_completed_at, created_at)
  SELECT 'user_biz_nurse', id, 'nurse@biz.test', 'Nurse Biz', 'nurse', NOW(), NOW() - INTERVAL '80 days' FROM c RETURNING id, clinic_id
), p AS (
  INSERT INTO patients (clinic_id, first_name, last_name, created_at)
  SELECT clinic_id, 'Wxyzina', 'Leakcheck', NOW() - INTERVAL '70 days' FROM s RETURNING id, clinic_id
)
SELECT p.clinic_id, p.id AS patient_id FROM p;

-- Three visits in each of the last four complete weeks.
INSERT INTO visits (clinic_id, patient_id, visit_date)
SELECT ctx.clinic_id, ctx.patient_id, (date_trunc('week', CURRENT_DATE)::DATE - 7 * w + d)
FROM ctx, generate_series(1, 4) w, generate_series(0, 2) d;

DO $$
DECLARE
  v_clinic UUID := (SELECT clinic_id FROM ctx);
  v_patient UUID := (SELECT patient_id FROM ctx);
  v_office UUID; v_other UUID; v_inv JSONB; v_acc UUID; v_r JSONB; v_cost UUID;
BEGIN
  PERFORM pg_temp.act_as('user_central');
  v_office := (office_admin_office_save(NULL, '{"slug":"biz-a","name":"Biz Office","country":"UG","currency":"UGX","territory":"Masaka","fee_amount":20000,"invoice_prefix":"BZ"}')->>'id')::UUID;
  v_other  := (office_admin_office_save(NULL, '{"slug":"biz-b","name":"Biz Other","country":"UG","currency":"UGX","territory":"Mbarara","fee_amount":20000}')->>'id')::UUID;
  PERFORM office_admin_office_save(v_office, '{"status":"active"}');
  PERFORM office_admin_office_save(v_other, '{"status":"active"}');
  v_inv := office_member_invite(v_office, 'owner', 'Owner');
  PERFORM pg_temp.act_as('user_biz_owner'); PERFORM office_member_accept(v_inv->>'token');
  PERFORM pg_temp.act_as('user_central'); v_inv := office_member_invite(v_other, 'owner', 'Other');
  PERFORM pg_temp.act_as('user_biz_other'); PERFORM office_member_accept(v_inv->>'token');

  PERFORM pg_temp.act_as('user_biz_owner');
  v_acc := (office_clinic_create(v_office, '{"name":"Biz HC III","district":"Masaka","tier":"full"}')->>'account_id')::UUID;
  PERFORM office_clinic_create(v_office, '{"name":"Biz Lead Clinic","district":"Kalungu"}');
  PERFORM pg_temp.act_as('user_central');
  PERFORM office_admin_clinic_link(v_acc, v_clinic);

  -- ================= Analytics: empty of opinion, full of counts =================
  PERFORM pg_temp.act_as('user_biz_owner');
  PERFORM office_clinic_health(v_acc);
  v_r := office_analytics(v_office);
  IF jsonb_array_length(v_r->'weeks') <> 12 THEN RAISE EXCEPTION 'expected 12 complete weeks, got %', jsonb_array_length(v_r->'weeks'); END IF;
  IF (v_r->'weeks'->11->>'visits')::INT <> 3 THEN RAISE EXCEPTION 'last complete week should count 3 visits, got %', v_r->'weeks'->11; END IF;
  IF (v_r->'weeks'->0->>'visits')::INT <> 0 THEN RAISE EXCEPTION 'a week before the clinic had visits should be 0'; END IF;
  IF (v_r->>'live_clinics')::INT <> 1 THEN RAISE EXCEPTION 'expected 1 live clinic'; END IF;
  IF (v_r->'funnel'->>'leads')::INT <> 2 OR (v_r->'funnel'->>'live')::INT <> 1 THEN RAISE EXCEPTION 'funnel wrong: %', v_r->'funnel'; END IF;
  IF jsonb_array_length(v_r->'clinics') <> 1 THEN RAISE EXCEPTION 'expected one live clinic row'; END IF;
  IF (v_r->'payments'->>'paid_invoices')::INT <> 0 THEN RAISE EXCEPTION 'no invoices have been paid yet'; END IF;
  IF v_r::TEXT ~* 'wxyzina|leakcheck' OR position(v_patient::TEXT IN v_r::TEXT) > 0 THEN RAISE EXCEPTION 'PATIENT DATA LEAKED into analytics'; END IF;

  -- Pausing a panel is remembered, validated, and owner-only.
  v_r := office_analytics_pause(v_office, 'funnel', TRUE);
  v_r := office_analytics_pause(v_office, 'funnel', TRUE);
  IF (office_analytics(v_office)->'paused') <> '["funnel"]'::jsonb THEN RAISE EXCEPTION 'pause should be stored once: %', office_analytics(v_office)->'paused'; END IF;
  PERFORM office_analytics_pause(v_office, 'funnel', FALSE);
  IF jsonb_array_length(office_analytics(v_office)->'paused') <> 0 THEN RAISE EXCEPTION 'resume should clear the pause'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_analytics_pause(%L, %L, TRUE)', v_office, 'patients'), '%UNKNOWN_PANEL%');

  -- ================= Cash flow inputs =================
  IF office_cashflow(v_office)->'balance' <> 'null'::jsonb THEN RAISE EXCEPTION 'balance should be empty until the partner enters one'; END IF;
  PERFORM office_cash_balance_set(v_office, 2150000);
  v_cost := (office_cost_save(v_office, '{"label":"Transport","amount":"380000"}')->>'id')::UUID;
  PERFORM office_cost_save(v_office, jsonb_build_object('id', v_cost, 'label', 'Transport and fuel', 'amount', '400000'));
  PERFORM office_cost_save(v_office, '{"label":"Printer","amount":"250000","cadence":"once"}');
  v_r := office_cashflow(v_office);
  IF (v_r->'balance'->>'amount')::BIGINT <> 2150000 THEN RAISE EXCEPTION 'balance not stored'; END IF;
  IF jsonb_array_length(v_r->'costs') <> 2 THEN RAISE EXCEPTION 'expected 2 costs, got %', v_r->'costs'; END IF;
  IF NOT (v_r->'costs' @> '[{"label":"Transport and fuel","amount":400000,"currency":"UGX"}]') THEN RAISE EXCEPTION 'cost edit not stored: %', v_r->'costs'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_cost_save(%L, %L)', v_office, '{"label":"","amount":"5"}'), '%INVALID_COST%');
  PERFORM pg_temp.expect_error(format('SELECT office_cash_balance_set(%L, -1)', v_office), '%INVALID_AMOUNT%');
  PERFORM office_cost_remove(v_cost);
  IF jsonb_array_length(office_cashflow(v_office)->'costs') <> 1 THEN RAISE EXCEPTION 'cost not removed'; END IF;

  -- ================= Another office sees and changes nothing =================
  PERFORM pg_temp.act_as('user_biz_other');
  PERFORM pg_temp.expect_error(format('SELECT office_analytics(%L)', v_office), '%Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_cashflow(%L)', v_office), '%Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_cash_balance_set(%L, 1)', v_office), '%Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_cost_save(%L, %L)', v_office, '{"label":"x","amount":"5"}'), '%Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_analytics_pause(%L, %L, TRUE)', v_office, 'usage'), '%Not a member%');
  IF (office_analytics(v_other)->>'live_clinics')::INT <> 0 THEN RAISE EXCEPTION 'other office should have no live clinics'; END IF;
END $$;

-- None of the new functions is open to people without a login.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname IN ('office_analytics', 'office_analytics_pause', 'office_cashflow',
                        'office_cash_balance_set', 'office_cost_save', 'office_cost_remove')
  LOOP
    RAISE EXCEPTION 'office function % is open to anon', r.proname;
  END LOOP;
END $$;

ROLLBACK;
\echo office_business: ok
