-- Karibu Office facility register (migrations 120, 121).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/office_facilities.sql

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

-- A made-up district, so the assertions do not depend on the seeded list.
INSERT INTO office.facilities (country, district, subcounty, name, level, authority, ownership, phone, phone_source, source, source_year) VALUES
  ('UG', 'Zzqtest', 'Alpha Subcounty', 'Zzq Mission HC III', 'HC III', 'UCMB', 'PNFP', '0772 000001', 'google_maps_unverified', 'test', 2018),
  ('UG', 'Zzqtest', 'Alpha Subcounty', 'Zzq Family Clinic', 'Clinic', 'Private', 'PFP', NULL, NULL, 'test', 2018),
  ('UG', 'Zzqtest', 'Beta Subcounty',  'Zzq Government HC II', 'HC II', 'MOH', 'GOVT', NULL, NULL, 'test', 2018),
  ('KE', 'Zzqtest', 'Alpha Subcounty', 'Zzq Kenyan Clinic', 'Clinic', 'Private', 'PFP', NULL, NULL, 'test', 2018);

DO $$
DECLARE
  v_office UUID; v_other UUID; v_inv JSONB; v_r JSONB; v_row JSONB; v_ids UUID[]; v_n INT;
BEGIN
  -- ================= The seeded Uganda list is there and sane =================
  SELECT COUNT(*) INTO v_n FROM office.facilities WHERE country = 'UG' AND source = 'moh_master_list';
  IF v_n < 6800 OR v_n > 6937 THEN RAISE EXCEPTION 'expected about 6,915 seeded facilities, got %', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM office.facilities WHERE district = 'Masaka' AND name = 'Ssunga HC III' AND ownership = 'PNFP') THEN
    RAISE EXCEPTION 'Ssunga HC III should be in the Masaka list';
  END IF;
  IF (SELECT COUNT(*) FROM office.facilities WHERE district = 'Masaka' AND source = 'moh_master_list') <> 45 THEN
    RAISE EXCEPTION 'the 2018 report lists 45 facilities in Masaka';
  END IF;
  IF EXISTS (SELECT 1 FROM office.facilities WHERE ownership IS NULL OR name = '' OR district = '') THEN
    RAISE EXCEPTION 'a seeded facility is missing its name, district or ownership';
  END IF;

  PERFORM pg_temp.act_as('user_central');
  v_office := (office_admin_office_save(NULL, '{"slug":"fac-a","name":"Fac Office","country":"UG","currency":"UGX","territory":"Masaka","fee_amount":20000,"invoice_prefix":"FA"}')->>'id')::UUID;
  v_other  := (office_admin_office_save(NULL, '{"slug":"fac-b","name":"Fac Other","country":"UG","currency":"UGX","territory":"Mbarara","fee_amount":20000}')->>'id')::UUID;
  PERFORM office_admin_office_save(v_office, '{"status":"active"}');
  PERFORM office_admin_office_save(v_other, '{"status":"active"}');
  v_inv := office_member_invite(v_office, 'owner', 'Owner');
  PERFORM pg_temp.act_as('user_fac_owner'); PERFORM office_member_accept(v_inv->>'token');
  PERFORM pg_temp.act_as('user_central'); v_inv := office_member_invite(v_other, 'owner', 'Other');
  PERFORM pg_temp.act_as('user_fac_other'); PERFORM office_member_accept(v_inv->>'token');

  -- ================= Search =================
  PERFORM pg_temp.act_as('user_fac_owner');
  v_r := office_facilities_search(v_office, '{"district":"zzqtest"}');
  IF (v_r->>'total')::INT <> 3 THEN RAISE EXCEPTION 'expected 3 Ugandan facilities in the test district (not the Kenyan one), got %', v_r->>'total'; END IF;
  -- Best fit first: the faith-based HC III, then the private clinic, then government.
  IF v_r->'rows'->0->>'name' <> 'Zzq Mission HC III' OR v_r->'rows'->2->>'ownership' <> 'GOVT' THEN RAISE EXCEPTION 'fit order wrong: %', v_r->'rows'; END IF;
  IF (v_r->'rows'->0->>'fit')::INT <> 3 OR (v_r->'rows'->1->>'fit')::INT <> 2 OR (v_r->'rows'->2->>'fit')::INT <> 1 THEN RAISE EXCEPTION 'fit scores wrong'; END IF;
  IF (office_facilities_search(v_office, '{"district":"Zzqtest","ownership":["PFP","PNFP"]}')->>'total')::INT <> 2 THEN RAISE EXCEPTION 'ownership filter'; END IF;
  IF (office_facilities_search(v_office, '{"district":"Zzqtest","levels":["Clinic"]}')->>'total')::INT <> 1 THEN RAISE EXCEPTION 'level filter'; END IF;
  IF (office_facilities_search(v_office, '{"q":"zzq family"}')->>'total')::INT <> 1 THEN RAISE EXCEPTION 'text search'; END IF;
  IF jsonb_array_length(office_facilities_search(v_office, '{"limit":2}')->'rows') <> 2 THEN RAISE EXCEPTION 'limit'; END IF;
  SELECT d INTO v_row FROM jsonb_array_elements(v_r->'districts') d WHERE d->>'district' = 'Zzqtest';
  IF (v_row->>'total')::INT <> 3 OR (v_row->>'open')::INT <> 2 OR (v_row->>'yours')::INT <> 0 THEN RAISE EXCEPTION 'district summary wrong: %', v_row; END IF;

  -- ================= Add to pipeline =================
  SELECT array_agg(id) INTO v_ids FROM office.facilities WHERE district = 'Zzqtest' AND country = 'UG' AND ownership <> 'GOVT';
  v_r := office_facilities_add(v_office, v_ids);
  IF jsonb_array_length(v_r) <> 2 OR v_r->0->>'status' <> 'created' OR v_r->1->>'status' <> 'created' THEN RAISE EXCEPTION 'add failed: %', v_r; END IF;
  IF NOT EXISTS (SELECT 1 FROM office.clinic_accounts WHERE office_id = v_office AND name = 'Zzq Mission HC III'
                 AND district = 'Zzqtest' AND stage = 'lead' AND source = 'import' AND facility_level = 'HC III'
                 AND contact_phone = '0772 000001' AND notes LIKE '%has not been checked%' AND notes LIKE '%UCMB%') THEN
    RAISE EXCEPTION 'the lead should carry the level, the phone and a warning that the phone is unchecked';
  END IF;
  -- Adding again is a duplicate, not a second lead.
  IF office_facilities_add(v_office, v_ids)->0->>'status' <> 'duplicate' THEN RAISE EXCEPTION 'second add should be a duplicate'; END IF;
  v_r := office_facilities_search(v_office, '{"district":"Zzqtest"}');
  IF v_r->'rows'->0->>'status' <> 'yours' OR v_r->'rows'->0->>'account_id' IS NULL THEN RAISE EXCEPTION 'added facility should show as yours with its account: %', v_r->'rows'->0; END IF;
  IF (office_facilities_search(v_office, '{"district":"Zzqtest","open_only":true}')->>'total')::INT <> 1 THEN RAISE EXCEPTION 'open_only should leave the government facility'; END IF;
  -- A facility in another country cannot be added.
  IF jsonb_array_length(office_facilities_add(v_office, ARRAY(SELECT id FROM office.facilities WHERE country = 'KE' AND district = 'Zzqtest'))) <> 0 THEN
    RAISE EXCEPTION 'a facility in another country was added';
  END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_facilities_add(%L, ARRAY(SELECT id FROM office.facilities LIMIT 51))', v_office), '%TOO_MANY%');

  -- ================= Another office: held, never by whom =================
  PERFORM pg_temp.act_as('user_fac_other');
  v_r := office_facilities_search(v_other, '{"district":"Zzqtest"}');
  IF v_r->'rows'->0->>'status' <> 'held' THEN RAISE EXCEPTION 'a facility another office holds should show as held'; END IF;
  IF v_r->'rows'->0->>'account_id' IS NOT NULL THEN RAISE EXCEPTION 'the holder''s account id leaked'; END IF;
  IF v_r::TEXT ~* 'fac office|fac-a' OR position(v_office::TEXT IN v_r::TEXT) > 0 THEN RAISE EXCEPTION 'the holding office was disclosed'; END IF;
  -- Claiming a held facility is refused and queued for Karibu, as for any clinic.
  IF office_facilities_add(v_other, v_ids)->0->>'status' <> 'conflict' THEN RAISE EXCEPTION 'expected a claim conflict'; END IF;
  IF NOT EXISTS (SELECT 1 FROM office.claim_conflicts WHERE office_id = v_other AND held_by_office_id = v_office) THEN RAISE EXCEPTION 'conflict not queued'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT office_facilities_search(%L)', v_office), '%Not a member%');
  PERFORM pg_temp.expect_error(format('SELECT office_facilities_add(%L, %L::uuid[])', v_office, v_ids), '%Not a member%');
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.office_facilities_search(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.office_facilities_add(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'the facility register is open to anon';
  END IF;
END $$;

ROLLBACK;
\echo office_facilities: ok
