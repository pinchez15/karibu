-- Karibu Office health, support, billing, grants and the no-PHI rule (migrations 117, 118).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/office_operations.sql

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

-- A live clinic with a distinctive patient, so any leak is easy to spot.
CREATE TEMP TABLE ctx AS
WITH c AS (
  INSERT INTO clinics (name, slug, clerk_organization_id, created_at) VALUES ('Ops HC III', 'ops-hc', 'org_ops', NOW() - INTERVAL '60 days') RETURNING id
), s AS (
  INSERT INTO staff (clerk_user_id, clinic_id, email, display_name, role, onboarding_completed_at, created_at)
  SELECT 'user_nurse', id, 'nurse@ops.test', 'Nurse Akello', 'nurse', NOW(), NOW() - INTERVAL '50 days' FROM c RETURNING id, clinic_id
), p AS (
  INSERT INTO patients (clinic_id, first_name, last_name, whatsapp_number, national_id, village, created_at)
  SELECT clinic_id, 'Qwertina', 'Zzyzxpatient', '+256799888777', 'CM9900112233XYZ', 'Xanaduville', NOW() - INTERVAL '45 days' FROM s RETURNING id, clinic_id
)
SELECT p.clinic_id, p.id AS patient_id, (SELECT id FROM s) AS staff_id FROM p;

DO $$
DECLARE
  v_clinic UUID := (SELECT clinic_id FROM ctx);
  v_patient UUID := (SELECT patient_id FROM ctx);
  v_staff UUID := (SELECT staff_id FROM ctx);
  v_office UUID; v_other UUID; v_inv JSONB; v_acc UUID; v_acc2 UUID; v_r JSONB; v_n INT;
  v_ticket UUID; v_invoice UUID; v_invoice2 UUID; v_pay UUID; v_token TEXT; v_ms UUID;
  v_all TEXT := '';
BEGIN
  PERFORM pg_temp.act_as('user_central');
  v_office := (office_admin_office_save(NULL, '{"slug":"ops-a","name":"Ops Office","country":"UG","currency":"UGX","territory":"Masaka","fee_amount":20000,"invoice_prefix":"OP"}')->>'id')::UUID;
  v_other  := (office_admin_office_save(NULL, '{"slug":"ops-b","name":"Other Office","country":"UG","currency":"UGX","territory":"Mbarara","fee_amount":20000}')->>'id')::UUID;
  PERFORM office_admin_office_save(v_office, '{"status":"active"}');
  PERFORM office_admin_office_save(v_other, '{"status":"active"}');
  v_inv := office_member_invite(v_office, 'owner', 'Owner');
  PERFORM pg_temp.act_as('user_owner'); PERFORM office_member_accept(v_inv->>'token');
  PERFORM pg_temp.act_as('user_central'); v_inv := office_member_invite(v_other, 'owner', 'Other');
  PERFORM pg_temp.act_as('user_other'); PERFORM office_member_accept(v_inv->>'token');

  PERFORM pg_temp.act_as('user_owner');
  v_acc := (office_clinic_create(v_office, '{"name":"Ops HC III","district":"Masaka","contact_phone":"0772 123456","tier":"full"}')->>'account_id')::UUID;
  PERFORM pg_temp.act_as('user_central');
  PERFORM office_admin_clinic_link(v_acc, v_clinic);
  IF (SELECT stage FROM office.clinic_accounts WHERE id = v_acc) <> 'live' THEN RAISE EXCEPTION 'linked clinic with patients should be live'; END IF;

  -- ================= Health =================
  -- Busy baseline two weeks ago, quiet last week, nothing for 3 days.
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO visits (clinic_id, patient_id, visit_date, department, status, doctor_id, updated_at)
  SELECT v_clinic, v_patient, CURRENT_DATE - d, 'opd', 'completed', v_staff, NOW() - make_interval(days => d)
  FROM generate_series(8, 20) d, generate_series(1, 4);
  INSERT INTO visits (clinic_id, patient_id, visit_date, department, status, doctor_id, updated_at)
  VALUES (v_clinic, v_patient, CURRENT_DATE - 3, 'opd', 'completed', v_staff, NOW() - INTERVAL '3 days');

  PERFORM pg_temp.act_as('user_owner');
  v_r := office_clinic_health(v_acc);
  IF v_r->>'score' <> 'red' THEN RAISE EXCEPTION '3 days silent should be red, got %', v_r; END IF;
  IF NOT (v_r->'reasons' ? 'no_sync' AND v_r->'reasons' ? 'usage_drop') THEN RAISE EXCEPTION 'expected no_sync and usage_drop, got %', v_r->'reasons'; END IF;
  IF (v_r->'metrics'->>'drop_pct')::INT < 90 THEN RAISE EXCEPTION 'drop should be about 96%%, got %', v_r->'metrics'->>'drop_pct'; END IF;
  IF jsonb_array_length(v_r->'daily') <> 14 THEN RAISE EXCEPTION 'expected 14 daily points'; END IF;
  v_all := v_all || v_r::TEXT;
  PERFORM pg_temp.act_as('user_other');
  PERFORM pg_temp.expect_error(format('SELECT office_clinic_health(%L)', v_acc), 'Not a member%');

  -- Nightly: alerts become to-dos, once.
  PERFORM pg_temp.act_as('user_owner');
  PERFORM pg_temp.expect_error('SELECT office_run_nightly()', 'Not allowed');
  PERFORM pg_temp.act_as(NULL);
  PERFORM office_run_nightly(); PERFORM office_run_nightly();
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE clinic_account_id = v_acc AND source = 'alert' AND status = 'open';
  IF v_n <> 2 THEN RAISE EXCEPTION 'expected exactly 2 open alerts (no_sync, usage_drop), got %', v_n; END IF;

  -- Activity returns: the alerts clear themselves.
  INSERT INTO visits (clinic_id, patient_id, visit_date, department, status, doctor_id)
  SELECT v_clinic, v_patient, CURRENT_DATE - d, 'opd', 'completed', v_staff FROM generate_series(0, 6) d, generate_series(1, 4);
  PERFORM office_run_nightly();
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE clinic_account_id = v_acc AND source = 'alert' AND status = 'open';
  IF v_n <> 0 THEN RAISE EXCEPTION 'alerts should clear when the clinic is active again, % still open', v_n; END IF;
  IF (SELECT score FROM office.clinic_health_daily WHERE clinic_id = v_clinic AND day = CURRENT_DATE) <> 'green' THEN RAISE EXCEPTION 'should be green'; END IF;

  -- A new, untrained staff member at a live clinic raises a follow-up.
  -- (Everything in this test shares one transaction timestamp, so date the go-live in the past.)
  UPDATE office.clinic_stage_events SET at = NOW() - INTERVAL '40 days' WHERE clinic_account_id = v_acc AND to_stage = 'live';
  INSERT INTO staff (clerk_user_id, clinic_id, email, display_name, role) VALUES ('user_new', v_clinic, 'new@ops.test', 'New Joiner', 'lab_tech');
  PERFORM office_run_nightly();
  IF NOT EXISTS (SELECT 1 FROM office.tasks WHERE clinic_account_id = v_acc AND kind = 'new_staff' AND status = 'open') THEN RAISE EXCEPTION 'expected a new_staff alert'; END IF;

  -- ================= Support =================
  PERFORM pg_temp.act_as('user_nurse');
  v_r := office_support_ticket_create('The receipt printer prints blank pages since this morning', 'printing',
                                      '{"screen":"billing","app":"web","patient_id":"should-be-dropped"}');
  v_ticket := (v_r->>'ticket_id')::UUID;
  IF v_r->>'routed_to' <> 'office' THEN RAISE EXCEPTION 'ticket should route to the clinic''s office'; END IF;
  IF (SELECT context FROM office.support_tickets WHERE id = v_ticket) ? 'patient_id' THEN RAISE EXCEPTION 'patient context must be stripped'; END IF;
  PERFORM pg_temp.expect_error('SELECT office_support_ticket_create(''hi'')', 'Describe the problem');
  -- Clinic staff cannot read the office side.
  PERFORM pg_temp.expect_error(format('SELECT office_ticket_get(%L)', v_ticket), 'Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_tickets_list(%L)', v_office), 'Not a member%');

  PERFORM pg_temp.act_as('user_other');
  PERFORM pg_temp.expect_error(format('SELECT office_ticket_get(%L)', v_ticket), 'Not a member%');

  PERFORM pg_temp.act_as('user_owner');
  IF jsonb_array_length(office_tickets_list(v_office)) <> 1 THEN RAISE EXCEPTION 'office should see the ticket'; END IF;
  IF office_ticket_get(v_ticket)->'raised_by'->>'name' <> 'Nurse Akello' THEN RAISE EXCEPTION 'staff name should show'; END IF;
  IF (office_home(v_office)->>'open_tickets')::INT <> 1 THEN RAISE EXCEPTION 'home should count the ticket'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_ticket_update(%L, NULL, NULL, TRUE)', v_ticket), 'ESCALATION_NEEDS_NOTE');
  PERFORM office_ticket_update(v_ticket, 'Re-paired the printer over the phone, still blank. Paper is thermal side up.', NULL, TRUE);
  v_all := v_all || office_ticket_get(v_ticket)::TEXT || office_tickets_list(v_office)::TEXT;

  PERFORM pg_temp.act_as('user_central');
  IF jsonb_array_length(office_admin_tickets()) <> 1 THEN RAISE EXCEPTION 'central should see the escalated ticket'; END IF;
  IF jsonb_array_length(office_ticket_get(v_ticket)->'notes') <> 1 THEN RAISE EXCEPTION 'escalation should carry the office''s note'; END IF;
  PERFORM office_ticket_update(v_ticket, 'Printer firmware bug, fixed in 1.0.31', 'resolved');
  IF EXISTS (SELECT 1 FROM office.tasks WHERE dedupe_key = 'ticket:' || v_ticket AND status = 'open') THEN RAISE EXCEPTION 'resolving should close the to-do'; END IF;

  -- A clinic no office holds goes straight to Karibu central.
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO clinics (id, name, slug) VALUES ('99999999-9999-9999-9999-999999999999', 'Orphan Clinic', 'orphan');
  INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role) VALUES ('88888888-8888-8888-8888-888888888888', 'user_orphan', '99999999-9999-9999-9999-999999999999', 'o@o.test', 'Orphan Staff', 'nurse');
  IF office_support_ticket_create('Sync has been stuck for two days', 'sync', '{}', '88888888-8888-8888-8888-888888888888')->>'routed_to' <> 'karibu' THEN
    RAISE EXCEPTION 'orphan clinic ticket should route to karibu';
  END IF;

  -- ================= Invoices and reconciliation =================
  PERFORM pg_temp.act_as('user_owner');
  v_acc2 := (office_clinic_create(v_office, '{"name":"Second HC II","district":"Masaka","contact_phone":"+256 701 555000"}')->>'account_id')::UUID;

  PERFORM pg_temp.expect_error(format('SELECT office_invoice_create(%L, ''[]'')', v_acc), 'An invoice needs%');
  PERFORM pg_temp.expect_error(format('SELECT office_invoice_create(%L, ''[{"description":"x","unit_amount":-5}]'')', v_acc), 'Check the amounts%');
  v_r := office_invoice_create(v_acc, '[{"kind":"setup","description":"Setup and first training day","quantity":1,"unit_amount":150000}]');
  IF v_r->>'number' <> 'OP-' || to_char(CURRENT_DATE, 'YYYY') || '-0001' OR (v_r->>'amount')::BIGINT <> 150000 THEN RAISE EXCEPTION 'unexpected invoice %', v_r; END IF;
  v_invoice := (v_r->>'id')::UUID;
  v_token := v_r->>'public_token';

  -- Monthly run is idempotent and skips clinics with no plan or not live.
  v_r := office_invoices_generate(v_office, CURRENT_DATE, '{"core":65000,"full":130000,"pro":260000}', '{"full":"Karibu Full"}');
  IF (v_r->>'created')::INT <> 1 THEN RAISE EXCEPTION 'expected 1 subscription invoice, got %', v_r; END IF;
  IF (office_invoices_generate(v_office, CURRENT_DATE, '{"full":130000}', '{}')->>'created')::INT <> 0 THEN RAISE EXCEPTION 'monthly run must be idempotent'; END IF;
  SELECT id INTO v_invoice2 FROM office.invoices WHERE clinic_account_id = v_acc AND period_start IS NOT NULL;
  PERFORM pg_temp.expect_error(format('SELECT office_invoice_create(%L, ''[{"description":"dup","unit_amount":1}]'', CURRENT_DATE)', v_acc), 'INVOICE_PERIOD_EXISTS');

  -- A draft is not visible on its public link; a sent one shows the OFFICE as seller.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM pg_temp.expect_error(format('SELECT office_invoice_public(%L)', v_token), 'LINK_INVALID');
  PERFORM pg_temp.act_as('user_owner');
  PERFORM office_update_profile(v_office, '{"legal_name":"Ops Health Services Ltd","payout_details":{"momo_mtn":"0772000111","account_name":"Ops Health Services"}}');
  PERFORM office_invoice_send(v_invoice); PERFORM office_invoice_send(v_invoice2);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_r := office_invoice_public(v_token);
  IF v_r->'office'->>'legal_name' <> 'Ops Health Services Ltd' OR v_r->'office'->'payout_details'->>'momo_mtn' <> '0772000111' THEN RAISE EXCEPTION 'public invoice should show the office and its payout details: %', v_r; END IF;
  IF v_r::TEXT ILIKE '%karibu health foundation%' OR v_r ? 'public_token' OR v_r ? 'id' THEN RAISE EXCEPTION 'public invoice leaks internals'; END IF;

  -- SMS paste: amount equals one open balance -> suggested, not yet counted.
  PERFORM pg_temp.act_as('user_owner');
  v_r := office_payment_record(v_office, '{"amount":150000,"method":"momo_mtn","reference":"11223344556","payer_phone":"256772123456","payer_name":"OPS HC","raw_evidence":"You have received UGX 150,000 ..."}');
  IF v_r->>'status' <> 'suggested' OR (v_r->>'invoice_id')::UUID <> v_invoice THEN RAISE EXCEPTION 'expected a suggestion for the setup invoice, got %', v_r; END IF;
  v_pay := (v_r->>'payment_id')::UUID;
  IF (SELECT amount_paid FROM office.invoices WHERE id = v_invoice) <> 0 THEN RAISE EXCEPTION 'a suggestion must not count until confirmed'; END IF;
  -- Same SMS pasted again.
  IF office_payment_record(v_office, '{"amount":150000,"method":"momo_mtn","reference":"11223344556"}')->>'status' <> 'duplicate' THEN RAISE EXCEPTION 'duplicate SMS must not be recorded twice'; END IF;

  PERFORM pg_temp.act_as('user_other');
  PERFORM pg_temp.expect_error(format('SELECT office_payment_match(%L)', v_pay), 'Not a member%');
  PERFORM pg_temp.act_as('user_owner');
  PERFORM office_payment_match(v_pay);
  IF (SELECT status FROM office.invoices WHERE id = v_invoice) <> 'paid' THEN RAISE EXCEPTION 'invoice should be paid'; END IF;
  IF (SELECT stage FROM office.clinic_accounts WHERE id = v_acc) <> 'billed' THEN RAISE EXCEPTION 'first paid invoice should move the clinic to billed'; END IF;
  IF (office_home(v_office)->'stage'->>'stage')::INT <> 3 THEN RAISE EXCEPTION 'office should be at stage 3 once an invoice is issued'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_invoice_void(%L, ''mistake'')', v_invoice), 'INVOICE_HAS_PAYMENTS');
  PERFORM pg_temp.expect_error(format('SELECT office_payment_remove(%L)', v_pay), 'PAYMENT_CONFIRMED');

  -- Part payment in cash against a chosen invoice counts at once.
  v_r := office_payment_record(v_office, jsonb_build_object('amount', 50000, 'method', 'cash', 'invoice_id', v_invoice2));
  IF v_r->>'status' <> 'matched' THEN RAISE EXCEPTION 'cash against a chosen invoice should be matched'; END IF;
  IF (SELECT status FROM office.invoices WHERE id = v_invoice2) <> 'part_paid' THEN RAISE EXCEPTION 'expected part_paid'; END IF;

  -- No invoice with that balance -> unmatched; statement import reports per row.
  v_r := office_payments_import(v_office, '[{"amount":80000,"method":"airtel","reference":"TID900","payer_phone":"0752000000"},{"amount":80000,"method":"airtel","reference":"TID900"},{"amount":0,"method":"bank"}]');
  IF (v_r->0->>'status', v_r->1->>'status', v_r->2->>'status') <> ('suggested', 'duplicate', 'error') THEN
    RAISE EXCEPTION 'unexpected import results %', v_r;
  END IF;
  v_r := office_money(v_office);
  IF (v_r->'totals'->>'billed')::BIGINT <> 280000 OR (v_r->'totals'->>'collected')::BIGINT <> 200000 OR (v_r->'totals'->>'outstanding')::BIGINT <> 80000 THEN
    RAISE EXCEPTION 'earnings wrong: %', v_r->'totals';
  END IF;
  IF jsonb_array_length(v_r->'unconfirmed_payments') <> 1 THEN RAISE EXCEPTION 'one payment should be waiting for confirmation'; END IF;
  v_all := v_all || v_r::TEXT || office_money_export(v_office)::TEXT || office_invoice_get(v_invoice)::TEXT;

  -- Overdue: stamped nightly, to-do raised once, cleared when paid.
  PERFORM pg_temp.act_as(NULL);
  UPDATE office.invoices SET due_date = CURRENT_DATE - 3 WHERE id = v_invoice2;
  PERFORM office_run_nightly(); PERFORM office_run_nightly();
  SELECT COUNT(*) INTO v_n FROM office.tasks WHERE dedupe_key = 'invoice_overdue:' || v_invoice2 AND status = 'open';
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected one overdue to-do, got %', v_n; END IF;
  PERFORM pg_temp.act_as('user_owner');
  PERFORM office_payment_match((SELECT id FROM office.payments WHERE reference = 'TID900'));
  IF (SELECT status FROM office.invoices WHERE id = v_invoice2) <> 'paid' THEN RAISE EXCEPTION 'second invoice should now be paid'; END IF;
  IF EXISTS (SELECT 1 FROM office.tasks WHERE dedupe_key = 'invoice_overdue:' || v_invoice2 AND status = 'open') THEN RAISE EXCEPTION 'overdue to-do should close on payment'; END IF;

  -- Void needs a reason and is audited.
  v_r := office_invoice_create(v_acc2, '[{"description":"Extra training day","unit_amount":50000}]');
  PERFORM pg_temp.expect_error(format('SELECT office_invoice_void(%L, '' '')', v_r->>'id'), 'A reason is required');
  PERFORM office_invoice_void((v_r->>'id')::UUID, 'Clinic cancelled the training');
  IF NOT EXISTS (SELECT 1 FROM office.audit_events WHERE action = 'invoice.void' AND resource_id = (v_r->>'id')::UUID) THEN RAISE EXCEPTION 'void must be audited'; END IF;

  -- ================= Grants =================
  PERFORM pg_temp.expect_error(format('SELECT office_admin_grant_create(%L, ''USD'', CURRENT_DATE, ''[{"key":"first_clinic_live","amount":50000}]'')', v_office), 'Karibu central only');
  PERFORM pg_temp.act_as('user_central');
  v_r := office_admin_grant_create(v_office, 'USD', CURRENT_DATE,
    '[{"key":"first_clinic_live","amount":50000},{"key":"three_clinics_billed","amount":100000},{"key":"something_undefined","amount":50000}]');
  IF (v_r->0->>'total')::BIGINT <> 200000 THEN RAISE EXCEPTION 'grant total should be the sum of milestones'; END IF;
  -- first_clinic_live verified itself from the auto event; the others did not.
  v_r := office_admin_milestones_ready();
  IF jsonb_array_length(v_r) <> 1 OR v_r->0->>'key' <> 'first_clinic_live' OR v_r->0->'evidence'->>'clinic' <> 'Ops HC III' THEN
    RAISE EXCEPTION 'first_clinic_live should verify automatically with evidence, got %', v_r;
  END IF;
  v_ms := (v_r->0->>'id')::UUID;
  PERFORM pg_temp.expect_error(format('SELECT office_admin_milestone_release(%L)',
    (SELECT id FROM office.grant_milestones WHERE milestone_key = 'three_clinics_billed')), 'MILESTONE_NOT_VERIFIED');
  PERFORM office_admin_milestone_release(v_ms, 'WIRE-77');
  IF NOT EXISTS (SELECT 1 FROM office.audit_events WHERE action = 'grant.released' AND resource_id = v_ms) THEN RAISE EXCEPTION 'release must be audited'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_admin_milestone_release(%L)', v_ms), 'MILESTONE_NOT_VERIFIED');

  -- A stage a PERSON set must never verify a milestone.
  PERFORM pg_temp.act_as(NULL);
  INSERT INTO office.clinic_stage_events (clinic_account_id, office_id, from_stage, to_stage, source)
  SELECT v_acc2, v_office, 'lead', 'billed', 'manual' UNION ALL SELECT v_acc2, v_office, 'lead', 'billed', 'manual';
  PERFORM office.verify_milestones(v_office);
  IF (SELECT status FROM office.grant_milestones WHERE milestone_key = 'three_clinics_billed') <> 'pending' THEN RAISE EXCEPTION 'manual stage events must not verify a milestone'; END IF;

  PERFORM pg_temp.act_as('user_owner');
  v_all := v_all || office_grants(v_office)::TEXT || office_home(v_office)::TEXT || office_clinics_list(v_office)::TEXT
        || office_clinic_get(v_acc)::TEXT || office_onboarding_get(v_acc)::TEXT;
  PERFORM pg_temp.act_as('user_central');
  v_all := v_all || office_admin_overview()::TEXT || office_admin_tickets()::TEXT || office_admin_unlinked_clinics()::TEXT;

  -- ================= The partner never sees a patient =================
  -- Everything an office member or central can load for this clinic, searched
  -- for the patient's name, phone, national ID, village and row id.
  IF v_all ~* 'qwertina|zzyzxpatient|799888777|CM9900112233XYZ|xanaduville' OR position(v_patient::TEXT IN v_all) > 0 THEN
    RAISE EXCEPTION 'PATIENT DATA LEAKED into an office payload';
  END IF;
  IF length(v_all) < 3000 THEN RAISE EXCEPTION 'leak check ran on too little data to mean anything'; END IF;
END $$;

-- Structural half of the same rule: no office function may even mention a
-- patient-identifying column. Counting patient ROWS is allowed; reading these
-- columns is not.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname AS fn, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'office' OR (n.nspname = 'public' AND p.proname LIKE 'office\_%')) AND p.prokind = 'f'
  LOOP
    IF r.def ~* '\m(first_name|last_name|date_of_birth|birth_year|approximate_age|whatsapp_number|patient_number|national_id|guardian_name|diagnosis|medications|chief_complaint|lab_results|lab_test_results|provider_notes|patient_notes|patient_vitals|prescription_orders|dispense_records)\M' THEN
      RAISE EXCEPTION 'office function % references a patient or clinical column', r.fn;
    END IF;
  END LOOP;

  -- And none is open to anon beyond the token-gated forms and the public storefront.
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'office\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('office_public_profile', 'office_public_slugs', 'office_readiness_form', 'office_readiness_submit',
                            'office_readiness_add_photo', 'office_storage_readiness_can_write', 'office_invoice_public')
  LOOP
    RAISE EXCEPTION 'office function % is unexpectedly open to anon', r.proname;
  END LOOP;
END $$;

ROLLBACK;
\echo office_operations: ok
