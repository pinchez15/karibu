-- Karibu Office remote onboarding (migration 116).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/office_onboarding.sql
-- Walks one clinic from lead to live with zero site visits, which is the
-- Phase 1 acceptance path, and checks the gates along the way.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_sub TEXT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.act_anon() RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
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

DO $$
DECLARE
  v_office UUID; v_other UUID; v_inv JSONB; v_acc UUID; v_token TEXT; v_r JSONB; v_clinic UUID;
  v_check UUID; v_staff UUID; v_n INT; v_mod TEXT; v_old_clinic UUID;
BEGIN
  PERFORM pg_temp.act_as('user_central');
  v_office := (office_admin_office_save(NULL, '{"slug":"onb-a","name":"Onboard A","country":"UG","currency":"UGX","territory":"Masaka","fee_amount":20000}')->>'id')::UUID;
  v_other  := (office_admin_office_save(NULL, '{"slug":"onb-b","name":"Onboard B","country":"UG","currency":"UGX","territory":"Mbarara","fee_amount":20000}')->>'id')::UUID;
  PERFORM office_admin_office_save(v_office, '{"status":"active"}');
  PERFORM office_admin_office_save(v_other, '{"status":"active"}');
  v_inv := office_member_invite(v_office, 'owner', 'Owner');
  PERFORM pg_temp.act_as('user_owner'); PERFORM office_member_accept(v_inv->>'token');
  PERFORM pg_temp.act_as('user_central'); v_inv := office_member_invite(v_other, 'owner', 'Other');
  PERFORM pg_temp.act_as('user_other'); PERFORM office_member_accept(v_inv->>'token');

  PERFORM pg_temp.act_as('user_owner');
  v_acc := (office_clinic_create(v_office, '{"name":"Zero Visit HC III","district":"Masaka","facility_level":"HC III","contact_phone":"+256700000002"}')->>'account_id')::UUID;

  -- ---- Readiness link ---------------------------------------------------------
  v_r := office_onboarding_start(v_acc, 'Sr. Grace', '+256700000003');
  v_token := v_r->>'token';
  IF (office_onboarding_start(v_acc)->>'token') <> v_token THEN RAISE EXCEPTION 're-share must reuse the live link'; END IF;
  IF (SELECT stage FROM office.clinic_accounts WHERE id = v_acc) <> 'readiness' THEN RAISE EXCEPTION 'stage should be readiness'; END IF;
  IF office_onboarding_get(v_acc)->'score'->>'score' <> 'red' THEN RAISE EXCEPTION 'no form yet: score must be red'; END IF;

  -- Another office cannot see or drive this onboarding.
  PERFORM pg_temp.act_as('user_other');
  PERFORM pg_temp.expect_error(format('SELECT office_onboarding_get(%L)', v_acc), 'Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_provision(%L, ''zero-visit'', ''org_x'')', v_acc), 'Not a member%');

  -- ---- The champion fills the form with no login -------------------------------
  PERFORM pg_temp.act_anon();
  PERFORM pg_temp.expect_error('SELECT office_readiness_form(''not-a-real-token-000000'')', 'LINK_INVALID');
  v_r := office_readiness_form(v_token);
  IF v_r->>'clinic_name' <> 'Zero Visit HC III' THEN RAISE EXCEPTION 'form should name the clinic'; END IF;
  v_check := (v_r->>'check_id')::UUID;
  PERFORM office_readiness_submit(v_token, jsonb_build_object(
    'power', '{"source":"grid","backup":true}'::jsonb,
    'devices', '{"android_phones":3,"tablets":0,"computers":1,"printer":false}'::jsonb,
    'signal', '{"network":"MTN","bars":3,"down_kbps":900}'::jsonb,
    'staff', '[{"name":"Grace N","role":"nurse","phone":"0700","email":"Grace@Clinic.test"},{"name":"Peter K","role":"records","email":"peter@clinic.test"},{"name":"  "}]'::jsonb,
    'services', '["OPD","Lab","Pharmacy"]'::jsonb, 'departments', '["opd","anc"]'::jsonb,
    'champion', '{"name":"Sr. Grace","phone":"+256700000003"}'::jsonb));
  PERFORM office_readiness_add_photo(v_token, 'drug_list', v_check::TEXT || '/drug_list-1.jpg');
  PERFORM pg_temp.expect_error(format('SELECT office_readiness_add_photo(%L, ''drug_list'', ''00000000-0000-0000-0000-000000000000/x.jpg'')', v_token), 'Bad photo path');
  IF NOT office_storage_readiness_can_write(v_check::TEXT || '/a.jpg') THEN RAISE EXCEPTION 'upload to own check should be allowed'; END IF;
  IF office_storage_readiness_can_write('00000000-0000-0000-0000-000000000000/a.jpg') THEN RAISE EXCEPTION 'upload to unknown check must be refused'; END IF;
  IF office_storage_readiness_can_read(v_check::TEXT || '/a.jpg') THEN RAISE EXCEPTION 'anon must not read photos'; END IF;

  -- ---- Partner reviews: staff draft arrived, score explains what blocks --------
  PERFORM pg_temp.act_as('user_other');
  IF office_storage_readiness_can_read(v_check::TEXT || '/a.jpg') THEN RAISE EXCEPTION 'other office must not read photos'; END IF;
  PERFORM pg_temp.act_as('user_owner');
  IF NOT office_storage_readiness_can_read(v_check::TEXT || '/a.jpg') THEN RAISE EXCEPTION 'owning office should read photos'; END IF;
  v_r := office_onboarding_get(v_acc);
  IF jsonb_array_length(v_r->'drafts'->'staff'->'rows') <> 2 THEN RAISE EXCEPTION 'staff draft should hold the 2 named staff: %', v_r->'drafts'; END IF;
  IF v_r->'drafts'->'staff'->'rows'->0->>'email' <> 'grace@clinic.test' THEN RAISE EXCEPTION 'emails should be lowercased'; END IF;
  IF v_r->'score'->>'score' <> 'amber' THEN RAISE EXCEPTION 'power and devices pass, rest pending: expected amber, got %', v_r->'score'; END IF;
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE clinic_account_id = v_acc AND kind = 'readiness_submitted' AND status = 'open';
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected a readiness_submitted task'; END IF;
  PERFORM office_readiness_review(v_acc);
  PERFORM pg_temp.act_anon();
  PERFORM pg_temp.expect_error(format('SELECT office_readiness_submit(%L, ''{}'')', v_token), 'LINK_LOCKED');

  -- ---- Catalog from a photo: draft, then a person approves ---------------------
  PERFORM pg_temp.act_as('user_owner');
  PERFORM office_catalog_draft_save(v_acc, 'drugs',
    '[{"name":"Paracetamol","strength":"500mg","formulation":"tablet","unit_price":"100","quantity":"1,000"},
      {"name":"Amoxicillin","strength":"250mg","formulation":"capsule","unit_price":"200","quantity":"0"},
      {"name":"Mystery syrup","formulation":"elixir"},{"name":""}]', 'ai');
  PERFORM office_catalog_draft_save(v_acc, 'services', '[{"name":"Consultation","kind":"consultation","price":"7,000"},{"name":"Malaria RDT","kind":"lab","price":"5000"}]', 'ai');
  IF office_onboarding_get(v_acc)->'score'->'checks' @> '[{"key":"catalog","status":"pass"}]' THEN RAISE EXCEPTION 'an unapproved draft must not pass the catalog check'; END IF;
  PERFORM office_catalog_draft_approve(v_acc, 'drugs');
  PERFORM office_catalog_draft_approve(v_acc, 'services');
  IF NOT office_onboarding_get(v_acc)->'score'->'checks' @> '[{"key":"catalog","status":"pass"}]' THEN RAISE EXCEPTION 'approved drugs should pass the catalog check'; END IF;

  -- ---- Provisioning: fee lapse blocks NEW clinics only --------------------------
  PERFORM pg_temp.act_as('user_central');
  PERFORM office_admin_office_save(v_office, jsonb_build_object('fee_starts_on', (date_trunc('month', CURRENT_DATE) - INTERVAL '4 months')::DATE));
  PERFORM pg_temp.act_as('user_owner');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_provision(%L, ''zero-visit'', ''org_zero'')', v_acc), 'PARTNER_FEE_LAPSED');
  PERFORM pg_temp.act_as('user_central');
  PERFORM office_admin_fee_mark(v_office, 5, 'MOMO-9');

  -- The Clerk webhook may have inserted a bare row first; provisioning adopts it.
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO clinics (name, slug, clerk_organization_id) VALUES ('Zero Visit HC III', 'zero-visit-hc-iii', 'org_zero');
  PERFORM pg_temp.act_as('user_owner');
  v_clinic := (office_clinic_provision(v_acc, 'zero-visit', 'org_zero', ARRAY['opd', 'anc', 'bogus'])->>'clinic_id')::UUID;
  SELECT COUNT(*) INTO v_n FROM clinics WHERE clerk_organization_id = 'org_zero';
  IF v_n <> 1 THEN RAISE EXCEPTION 'webhook row should be adopted, not duplicated'; END IF;
  SELECT COUNT(*) INTO v_n FROM clinic_departments WHERE clinic_id = v_clinic;
  IF v_n <> 2 THEN RAISE EXCEPTION 'expected 2 valid departments, got %', v_n; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_provision(%L, ''zero-visit-2'', ''org_zero2'')', v_acc), 'ALREADY_PROVISIONED');

  -- The partner has no staff row, so no route into the EHR.
  SELECT COUNT(*) INTO v_n FROM staff WHERE clinic_id = v_clinic;
  IF v_n <> 0 THEN RAISE EXCEPTION 'provisioning must not create staff for the partner'; END IF;

  -- An existing, established clinic cannot be claimed by passing its org id.
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO clinics (name, slug, clerk_organization_id, created_at) VALUES ('Old Clinic', 'old-clinic', 'org_old', NOW() - INTERVAL '90 days') RETURNING id INTO v_old_clinic;
  PERFORM pg_temp.act_as('user_owner');
  v_r := office_clinic_create(v_office, '{"name":"Sneaky","district":"Masaka"}');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_provision(%L, ''sneaky'', ''org_old'')', v_r->>'account_id'), 'That clinic already exists%');

  -- Approved drafts were written to the clinic on provisioning.
  SELECT COUNT(*) INTO v_n FROM pharmacy_stock_items WHERE clinic_id = v_clinic;
  IF v_n <> 3 THEN RAISE EXCEPTION 'expected 3 stock items, got %', v_n; END IF;
  IF (SELECT quantity_on_hand FROM pharmacy_stock_items WHERE clinic_id = v_clinic AND drug_code = 'PARACETAMOL') <> 1000 THEN
    RAISE EXCEPTION 'opening balance should be 1000';
  END IF;
  IF (SELECT formulation FROM pharmacy_stock_items WHERE clinic_id = v_clinic AND drug_code = 'MYSTERY_SYRUP') <> 'other' THEN
    RAISE EXCEPTION 'unknown formulation should fall back to other';
  END IF;
  IF (SELECT consultation_fee_ugx FROM clinic_billing_rates WHERE clinic_id = v_clinic) <> 7000 THEN RAISE EXCEPTION 'consultation fee should be 7000'; END IF;
  v_r := office_onboarding_get(v_acc);
  IF (v_r->'drafts'->'services'->'apply_result'->>'not_applied')::INT <> 1 THEN RAISE EXCEPTION 'the lab price should be reported as not applied'; END IF;
  IF v_r->'account'->>'stage' <> 'configured' THEN RAISE EXCEPTION 'stage should be configured, got %', v_r->'account'->>'stage'; END IF;

  -- ---- Staff invites ------------------------------------------------------------
  PERFORM office_staff_invite_record(v_acc, 'Grace@Clinic.test', 'Grace N', 'nurse', 'inv_1');
  PERFORM office_staff_invite_record(v_acc, 'grace@clinic.test', 'Grace N', 'nurse', 'inv_1b');  -- resend
  PERFORM office_staff_invite_record(v_acc, 'peter@clinic.test', 'Peter K', 'records_officer', 'inv_2');
  PERFORM pg_temp.expect_error(format('SELECT office_staff_invite_record(%L, ''x@clinic.test'', ''X'', ''superuser'', ''inv_3'')', v_acc), 'Unknown staff role');
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO staff (clerk_user_id, clinic_id, email, display_name, role) VALUES ('user_elsewhere', v_old_clinic, 'taken@clinic.test', 'Taken', 'nurse');
  PERFORM pg_temp.act_as('user_owner');
  PERFORM pg_temp.expect_error(format('SELECT office_staff_invite_record(%L, ''taken@clinic.test'', ''Taken'', ''nurse'', ''inv_4'')', v_acc), 'STAFF_AT_ANOTHER_CLINIC');
  v_r := office_onboarding_get(v_acc)->'training';
  IF (v_r->>'total')::INT <> 2 OR (v_r->>'trained')::INT <> 0 THEN RAISE EXCEPTION 'two invited, none trained: %', v_r; END IF;

  -- ---- Staff accept (webhook) and train on their own phones ---------------------
  PERFORM pg_temp.act_as(NULL);
  UPDATE staff_invitations SET status = 'accepted' WHERE clinic_id = v_clinic;
  INSERT INTO staff (clerk_user_id, clinic_id, email, display_name, role) VALUES
    ('user_grace', v_clinic, 'grace@clinic.test', 'Grace N', 'nurse'),
    ('user_peter', v_clinic, 'peter@clinic.test', 'Peter K', 'records_officer');
  PERFORM pg_temp.act_as('user_owner');
  IF office_onboarding_get(v_acc)->'score'->>'score' <> 'amber' THEN RAISE EXCEPTION 'untrained staff: expected amber'; END IF;
  IF (SELECT readiness_cleared_at FROM office.clinic_accounts WHERE id = v_acc) IS NOT NULL THEN RAISE EXCEPTION 'must not clear before training'; END IF;

  FOR v_staff IN SELECT id FROM staff WHERE clinic_id = v_clinic LOOP
    PERFORM pg_temp.act_as((SELECT clerk_user_id FROM staff WHERE id = v_staff));
    FOREACH v_mod IN ARRAY onboarding_required_modules() LOOP
      PERFORM rpc_complete_onboarding_module(v_mod, 5, 5);
    END LOOP;
  END LOOP;

  -- ---- Green with zero site visits; stage 2 unlocks ------------------------------
  PERFORM pg_temp.act_as('user_owner');
  v_r := office_onboarding_get(v_acc);
  IF v_r->'score'->>'score' <> 'green' THEN RAISE EXCEPTION 'expected green, got %', v_r->'score'; END IF;
  IF v_r->'account'->>'stage' <> 'trained' THEN RAISE EXCEPTION 'expected trained, got %', v_r->'account'->>'stage'; END IF;
  SELECT COUNT(*) INTO v_n FROM office.site_visits WHERE clinic_account_id = v_acc;
  IF v_n <> 0 THEN RAISE EXCEPTION 'this path must need no site visit'; END IF;
  IF (office_home(v_office)->'stage'->>'stage')::INT <> 2 THEN RAISE EXCEPTION 'office should be stage 2 once readiness clears'; END IF;

  -- ---- First patient = live, detected from the EHR --------------------------------
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO patients (clinic_id, first_name, last_name) VALUES (v_clinic, 'Namukasa', 'Zzsecretpatient');
  PERFORM pg_temp.act_as('user_owner');
  v_r := office_onboarding_get(v_acc);
  IF v_r->'account'->>'stage' <> 'live' THEN RAISE EXCEPTION 'expected live, got %', v_r->'account'->>'stage'; END IF;
  IF NOT EXISTS (SELECT 1 FROM office.clinic_stage_events WHERE clinic_account_id = v_acc AND to_stage = 'live' AND source = 'auto') THEN
    RAISE EXCEPTION 'live must be recorded as an automatic milestone';
  END IF;
  -- No patient identity in anything the partner can load for this clinic.
  IF (v_r::TEXT || office_clinic_get(v_acc)::TEXT || office_home(v_office)::TEXT || office_clinics_list(v_office)::TEXT) ~* 'namukasa|zzsecretpatient' THEN
    RAISE EXCEPTION 'patient name leaked into an office payload';
  END IF;

  -- ---- Steady needs a week live and visits on most days ---------------------------
  PERFORM pg_temp.act_as(NULL);
  UPDATE office.clinic_stage_events SET at = NOW() - INTERVAL '8 days' WHERE clinic_account_id = v_acc AND to_stage = 'live';
  INSERT INTO visits (clinic_id, patient_id, visit_date, department, status)
  SELECT v_clinic, (SELECT id FROM patients WHERE clinic_id = v_clinic LIMIT 1), CURRENT_DATE - d, 'opd', 'completed'
  FROM generate_series(0, 4) d;
  PERFORM office.refresh_account_progress(v_acc);
  IF (SELECT stage FROM office.clinic_accounts WHERE id = v_acc) <> 'steady' THEN RAISE EXCEPTION 'expected steady'; END IF;

  -- ---- Central links a clinic that predates offices -------------------------------
  PERFORM pg_temp.act_as('user_owner');
  v_r := office_clinic_create(v_office, '{"name":"Old Clinic","district":"Masaka"}');
  PERFORM pg_temp.expect_error(format('SELECT office_admin_clinic_link(%L, %L)', v_r->>'account_id', v_old_clinic), 'Karibu central only');
  PERFORM pg_temp.act_as('user_central');
  IF NOT office_admin_unlinked_clinics() @> jsonb_build_array(jsonb_build_object('name', 'Old Clinic')) THEN RAISE EXCEPTION 'old clinic should be listed as unlinked'; END IF;
  PERFORM office_admin_clinic_link((v_r->>'account_id')::UUID, v_old_clinic);
END $$;

DO $$
BEGIN
  IF NOT has_function_privilege('anon', 'public.office_readiness_submit(text, jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'readiness form must be open to anon'; END IF;
  IF has_function_privilege('anon', 'public.office_onboarding_get(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'onboarding page must not be open to anon'; END IF;
  IF has_function_privilege('anon', 'public.office_clinic_provision(uuid, text, text, text[], text)', 'EXECUTE') THEN RAISE EXCEPTION 'provisioning must not be open to anon'; END IF;
END $$;

ROLLBACK;
\echo office_onboarding: ok
