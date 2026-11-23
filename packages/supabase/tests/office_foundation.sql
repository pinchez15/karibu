-- Karibu Office foundation (migration 115).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/office_foundation.sql
-- Covers: membership gates, join links, first-claim-per-clinic, conflict
-- resolution, the partner fee ledger and lapse rule, stage rules, transfer.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_sub TEXT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END, true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_like THEN
      RAISE EXCEPTION 'expected error like "%", got "%" for: %', p_like, SQLERRM, p_sql;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error like "%" but statement succeeded: %', p_like, p_sql;
END $$;

INSERT INTO superadmins (clerk_user_id, email, display_name) VALUES ('user_central', 'central@test', 'Central');

DO $$
DECLARE
  v_a UUID; v_b UUID;
  v_inv JSONB; v_r JSONB; v_acc UUID; v_conflict UUID; v_n INT;
BEGIN
  -- ---- Central creates two offices and invites an owner to each -------------
  PERFORM pg_temp.act_as('user_central');
  v_a := (office_admin_office_save(NULL, '{"slug":"test-a","name":"Karibu Test A","country":"UG","currency":"UGX","territory":"Masaka","fee_amount":20000,"invoice_prefix":"TA"}')->>'id')::UUID;
  v_b := (office_admin_office_save(NULL, '{"slug":"test-b","name":"Karibu Test B","country":"UG","currency":"UGX","territory":"Mbarara","fee_amount":20000}')->>'id')::UUID;
  PERFORM office_admin_office_save(v_a, '{"status":"active"}');
  PERFORM office_admin_office_save(v_b, '{"status":"active"}');

  v_inv := office_member_invite(v_a, 'owner', 'Owner A');

  -- ---- A stranger cannot read or write an office ---------------------------
  PERFORM pg_temp.act_as('user_stranger');
  PERFORM pg_temp.expect_error(format('SELECT office_home(%L)', v_a), 'Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_clinics_list(%L)', v_a), 'Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_create(%L, ''{"name":"X"}'')', v_a), 'Not a member%');
  PERFORM pg_temp.expect_error('SELECT office_admin_overview()', 'Karibu central only');
  PERFORM pg_temp.expect_error(format('SELECT office_member_invite(%L, ''owner'', ''Me'')', v_a), 'Karibu central only');

  -- ---- Join link: single use ----------------------------------------------
  PERFORM pg_temp.act_as('user_owner_a');
  PERFORM office_member_accept(v_inv->>'token');
  IF jsonb_array_length(office_me()->'memberships') <> 1 THEN RAISE EXCEPTION 'owner A should have one membership'; END IF;
  PERFORM pg_temp.act_as('user_stranger');
  PERFORM pg_temp.expect_error(format('SELECT office_member_accept(%L)', v_inv->>'token'), 'INVITE_INVALID');

  PERFORM pg_temp.act_as('user_central');
  v_inv := office_member_invite(v_b, 'owner', 'Owner B');
  PERFORM pg_temp.act_as('user_owner_b');
  PERFORM office_member_accept(v_inv->>'token');

  -- ---- First claim per clinic ----------------------------------------------
  PERFORM pg_temp.act_as('user_owner_a');
  v_r := office_clinic_create(v_a, '{"name":"Kitanda Health Centre III","district":"Masaka","contact_phone":"+256700000001"}');
  IF v_r->>'status' <> 'created' THEN RAISE EXCEPTION 'expected created, got %', v_r; END IF;
  v_acc := (v_r->>'account_id')::UUID;

  -- Same office, same clinic spelled differently: duplicate, not a second row.
  v_r := office_clinic_create(v_a, '{"name":"kitanda HC 3","district":"MASAKA"}');
  IF v_r->>'status' <> 'duplicate' THEN RAISE EXCEPTION 'expected duplicate, got %', v_r; END IF;

  -- Another office: blocked, flagged, and not told who holds it.
  PERFORM pg_temp.act_as('user_owner_b');
  v_r := office_clinic_create(v_b, '{"name":"Kitanda HC III","district":"Masaka"}');
  IF v_r->>'status' <> 'conflict' THEN RAISE EXCEPTION 'expected conflict, got %', v_r; END IF;
  IF v_r ? 'account_id' OR v_r::text LIKE '%Test A%' THEN RAISE EXCEPTION 'conflict leaked the holder: %', v_r; END IF;
  v_conflict := (v_r->>'conflict_id')::UUID;
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_get(%L)', v_acc), 'Not a member%');

  -- Different district is a different clinic.
  v_r := office_clinic_create(v_b, '{"name":"Kitanda HC III","district":"Mbarara"}');
  IF v_r->>'status' <> 'created' THEN RAISE EXCEPTION 'expected created in other district, got %', v_r; END IF;

  -- Central sees the conflict and denies it; office B gets told.
  PERFORM pg_temp.act_as('user_central');
  IF jsonb_array_length(office_admin_overview()->'conflicts') <> 1 THEN RAISE EXCEPTION 'central should see one open conflict'; END IF;
  PERFORM office_admin_conflict_resolve(v_conflict, 'deny', 'Same facility');
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE office_id = v_b AND kind = 'claim_deny';
  IF v_n <> 1 THEN RAISE EXCEPTION 'office B should have a claim_deny task'; END IF;

  -- ---- CSV import returns one result per row --------------------------------
  PERFORM pg_temp.act_as('user_owner_a');
  v_r := office_clinics_import(v_a, '[{"name":"Bukoto HC II","district":"Masaka"},{"name":"Kitanda HC III","district":"Masaka"},{"name":""}]');
  IF (v_r->0->>'status', v_r->1->>'status', v_r->2->>'status') <> ('created', 'duplicate', 'error') THEN
    RAISE EXCEPTION 'unexpected import results: %', v_r;
  END IF;

  -- ---- Stage rules -----------------------------------------------------------
  PERFORM office_clinic_set_stage(v_acc, 'demo');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_set_stage(%L, ''live'')', v_acc), 'STAGE_IS_AUTOMATIC');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_set_stage(%L, ''billed'')', v_acc), 'STAGE_IS_AUTOMATIC');
  SELECT COUNT(*) INTO v_n FROM office.clinic_stage_events WHERE clinic_account_id = v_acc;
  IF v_n <> 2 THEN RAISE EXCEPTION 'expected 2 stage events, got %', v_n; END IF;
  IF (office_home(v_a)->'stage'->>'stage')::INT <> 1 THEN RAISE EXCEPTION 'office A should be stage 1'; END IF;

  -- ---- Field visit log is idempotent (offline replay) -----------------------
  v_r := office_clinic_create(v_a, '{"name":"Replay Clinic","district":"Masaka"}');
  PERFORM office_site_visit_log('11111111-1111-1111-1111-111111111111', (v_r->>'account_id')::UUID, 'sales', 'Met the in-charge');
  PERFORM office_site_visit_log('11111111-1111-1111-1111-111111111111', (v_r->>'account_id')::UUID, 'sales', 'Met the in-charge');
  SELECT COUNT(*) INTO v_n FROM office.site_visits WHERE clinic_account_id = (v_r->>'account_id')::UUID;
  IF v_n <> 1 THEN RAISE EXCEPTION 'replayed visit duplicated'; END IF;
  IF (SELECT stage FROM office.clinic_accounts WHERE id = (v_r->>'account_id')::UUID) <> 'contacted' THEN
    RAISE EXCEPTION 'first contact should move lead to contacted';
  END IF;

  -- ---- Partner fee -----------------------------------------------------------
  IF office_home(v_a)->>'fee_status' <> 'not_started' THEN RAISE EXCEPTION 'fee should not have started'; END IF;
  PERFORM pg_temp.act_as('user_central');
  PERFORM office_admin_office_save(v_a, jsonb_build_object('fee_starts_on', (date_trunc('month', CURRENT_DATE) - INTERVAL '4 months')::DATE));
  PERFORM pg_temp.act_as('user_owner_a');
  IF office_fee_ledger(v_a)->>'status' <> 'lapsed' THEN RAISE EXCEPTION 'four unpaid months should be lapsed, got %', office_fee_ledger(v_a)->>'status'; END IF;
  IF jsonb_array_length(office_fee_ledger(v_a)->'periods') <> 5 THEN RAISE EXCEPTION 'expected 5 fee periods'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office.assert_can_provision(%L)', v_a), 'PARTNER_FEE_LAPSED');
  PERFORM pg_temp.expect_error(format('SELECT office_admin_fee_mark(%L, 5, ''REF1'')', v_a), 'Karibu central only');

  -- One transfer covers several months, oldest first; then paying ahead.
  PERFORM pg_temp.act_as('user_central');
  PERFORM pg_temp.expect_error(format('SELECT office_admin_fee_mark(%L, 1, '''')', v_a), 'A payment reference is required');
  IF office_admin_fee_mark(v_a, 4, 'MOMO-123')->>'status' <> 'due' THEN RAISE EXCEPTION 'current month should still be due'; END IF;
  IF office_admin_fee_mark(v_a, 2, 'MOMO-124')->>'status' <> 'current' THEN RAISE EXCEPTION 'should be current after paying ahead'; END IF;
  SELECT COUNT(*) INTO v_n FROM office.partner_fees WHERE office_id = v_a AND status = 'paid' AND fund = 'network_fund:UG';
  IF v_n <> 6 THEN RAISE EXCEPTION 'expected 6 paid periods in the UG fund, got %', v_n; END IF;
  PERFORM office.assert_can_provision(v_a);

  -- ---- Ownership transfer ---------------------------------------------------
  PERFORM office_admin_clinic_transfer(v_acc, v_b, 'Owner A exited Masaka');
  PERFORM pg_temp.act_as('user_owner_b');
  PERFORM office_clinic_get(v_acc);
  PERFORM pg_temp.act_as('user_owner_a');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_get(%L)', v_acc), 'Not a member%');
  SELECT COUNT(*) INTO v_n FROM office.audit_events WHERE resource_id = v_acc AND action LIKE 'clinic.transferred_%';
  IF v_n <> 2 THEN RAISE EXCEPTION 'transfer should write two audit events'; END IF;

  -- ---- Public lead form is service-role only -------------------------------
  PERFORM pg_temp.expect_error('SELECT office_capture_lead(''test-a'', ''{"name":"Web Lead"}'')', 'Not allowed');
  PERFORM pg_temp.act_as(NULL);
  v_r := office_capture_lead('test-a', '{"name":"Web Lead Clinic","district":"Masaka","contact_phone":"+256700000009"}');
  IF v_r <> '{"received": true}'::jsonb THEN RAISE EXCEPTION 'lead form should reveal nothing: %', v_r; END IF;
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE office_id = v_a AND kind = 'new_lead';
  IF v_n <> 1 THEN RAISE EXCEPTION 'a new lead should create a task'; END IF;
END $$;

-- ---- Privileges: the schema is closed, the public form is not open to users --
DO $$
BEGIN
  IF has_schema_privilege('authenticated', 'office', 'USAGE') OR has_schema_privilege('anon', 'office', 'USAGE') THEN
    RAISE EXCEPTION 'office schema must not be usable by anon/authenticated';
  END IF;
  IF has_function_privilege('authenticated', 'public.office_capture_lead(text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'office_capture_lead must not be callable by signed-in users';
  END IF;
  IF has_function_privilege('anon', 'public.office_home(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'office_home must not be callable by anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'office' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'every office table must have RLS enabled';
  END IF;
END $$;

ROLLBACK;

\echo office_foundation: ok
