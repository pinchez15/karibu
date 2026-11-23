-- 116_office_onboarding.sql
-- Karibu Office module C: remote onboarding (docs/karibu-office-spec.md §7.C).
--
--   readiness link -> login-free form -> photo-to-data drafts (human approved)
--   -> office-scoped clinic provisioning and staff invites -> training tracking
--   -> readiness score -> go-live -> automatic milestones.
--
-- What crosses into the EHR here, and only through these functions:
--   * creating a clinic row and its departments for an account the office owns
--   * recording staff invitations for that clinic
--   * writing the approved drug catalog into pharmacy_stock_items
--   * reading staff names and training completion, and COUNTS of patients and
--     visits. No patient row is ever returned.

-- ============================================================================
-- 1. Training status (staff names are fine: the office trains them)
-- ============================================================================

CREATE OR REPLACE FUNCTION office.staff_training(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_required TEXT[] := onboarding_required_modules();
  v_staff JSONB;
  v_invited JSONB;
  v_total INTEGER;
  v_trained INTEGER;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('staff', '[]'::jsonb, 'invited', '[]'::jsonb, 'total', 0, 'trained', 0, 'pct', 0);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'staff_id', s.id, 'name', s.display_name, 'role', s.role,
           'modules_done', (SELECT COUNT(*) FROM staff_onboarding_progress p
                            WHERE p.staff_id = s.id AND p.module_id = ANY (v_required)),
           'modules_total', cardinality(v_required),
           'trained', s.onboarding_completed_at IS NOT NULL,
           'joined_at', s.created_at) ORDER BY s.display_name), '[]'::jsonb),
         COUNT(*), COUNT(*) FILTER (WHERE s.onboarding_completed_at IS NOT NULL)
    INTO v_staff, v_total, v_trained
  FROM staff s
  WHERE s.clinic_id = p_clinic_id AND s.is_active AND s.deactivated_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id, 'name', i.display_name, 'email', i.email,
           'role', i.role, 'invited_at', i.created_at) ORDER BY i.created_at), '[]'::jsonb)
    INTO v_invited
  FROM staff_invitations i
  WHERE i.clinic_id = p_clinic_id AND i.status = 'pending';

  -- People who have not accepted yet count as untrained.
  v_total := v_total + jsonb_array_length(v_invited);

  RETURN jsonb_build_object(
    'staff', v_staff, 'invited', v_invited, 'total', v_total, 'trained', v_trained,
    'pct', CASE WHEN v_total = 0 THEN 0 ELSE (v_trained * 100) / v_total END);
END;
$$;

-- ============================================================================
-- 2. Readiness score
-- ============================================================================
-- Green means nobody needs to travel to find a surprise. Each check is
-- pass | warn | fail so the page can say exactly what is blocking.

CREATE OR REPLACE FUNCTION office.readiness_score(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_check office.readiness_checks;
  v_training JSONB;
  v_catalog BOOLEAN;
  v_power TEXT; v_devices TEXT; v_signal TEXT; v_cat TEXT; v_champ TEXT; v_train TEXT;
  v_score TEXT;
BEGIN
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id;
  SELECT * INTO v_check FROM office.readiness_checks
  WHERE clinic_account_id = p_account_id AND status IN ('submitted', 'reviewed')
  ORDER BY submitted_at DESC LIMIT 1;

  v_training := office.staff_training(v_account.clinic_id);
  SELECT EXISTS (SELECT 1 FROM office.catalog_drafts
                 WHERE clinic_account_id = p_account_id AND kind = 'drugs' AND status IN ('approved', 'applied'))
    INTO v_catalog;

  IF v_check.id IS NULL THEN
    v_power := 'fail'; v_devices := 'fail'; v_signal := 'fail';
  ELSE
    v_power := CASE
      WHEN COALESCE(v_check.power->>'source', 'none') = 'none' THEN 'fail'
      WHEN v_check.power->>'source' = 'solar' OR COALESCE((v_check.power->>'backup')::BOOLEAN, FALSE) THEN 'pass'
      ELSE 'warn' END;
    v_devices := CASE
      WHEN COALESCE((v_check.devices->>'android_phones')::INTEGER, 0)
         + COALESCE((v_check.devices->>'tablets')::INTEGER, 0) >= 1 THEN 'pass'
      ELSE 'fail' END;
    -- Karibu runs offline, so weak signal is a warning, not a blocker.
    v_signal := CASE
      WHEN COALESCE((v_check.signal->>'bars')::INTEGER, 0) >= 2
        OR COALESCE((v_check.signal->>'down_kbps')::NUMERIC, 0) >= 150 THEN 'pass'
      ELSE 'warn' END;
  END IF;

  v_cat := CASE WHEN v_catalog THEN 'pass' ELSE 'fail' END;
  v_champ := CASE WHEN COALESCE(v_account.champion_name, '') <> '' THEN 'pass' ELSE 'fail' END;
  v_train := CASE
    WHEN (v_training->>'total')::INTEGER > 0
     AND (v_training->>'pct')::INTEGER >= office.setting_int('trained_pct', 80) THEN 'pass'
    ELSE 'fail' END;

  -- Red: the clinic cannot run Karibu yet. Amber: something is still to do.
  -- Warnings (grid power with no backup, weak signal) are shown but do not block.
  v_score := CASE
    WHEN 'fail' IN (v_power, v_devices) THEN 'red'
    WHEN 'fail' IN (v_cat, v_champ, v_train) THEN 'amber'
    ELSE 'green' END;

  RETURN jsonb_build_object(
    'score', v_score,
    'submitted', v_check.id IS NOT NULL,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'power', 'status', v_power),
      jsonb_build_object('key', 'devices', 'status', v_devices),
      jsonb_build_object('key', 'signal', 'status', v_signal),
      jsonb_build_object('key', 'catalog', 'status', v_cat),
      jsonb_build_object('key', 'champion', 'status', v_champ),
      jsonb_build_object('key', 'training', 'status', v_train,
                         'trained', v_training->'trained', 'total', v_training->'total')));
END;
$$;

-- ============================================================================
-- 3. Automatic milestones (spec §7.C.7)
-- ============================================================================
-- Observes the clinic and moves the account forward. Reads counts only.

CREATE OR REPLACE FUNCTION office.refresh_account_progress(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_score JSONB;
  v_training JSONB;
  v_first_patient TIMESTAMPTZ;
  v_live_since TIMESTAMPTZ;
  v_active_days INTEGER;
  v_steady INTEGER := office.setting_int('steady_days', 7);
BEGIN
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL OR v_account.stage = 'churned' THEN RETURN; END IF;

  v_score := office.readiness_score(p_account_id);
  IF v_score->>'score' = 'green' AND v_account.readiness_cleared_at IS NULL THEN
    UPDATE office.clinic_accounts SET readiness_cleared_at = NOW() WHERE id = p_account_id;
    INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, source, dedupe_key)
    VALUES (v_account.office_id, p_account_id, 'go_live', v_account.name, 'system', 'go_live:' || p_account_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_account.clinic_id IS NULL THEN RETURN; END IF;

  v_training := office.staff_training(v_account.clinic_id);
  IF (v_training->>'total')::INTEGER > 0
     AND (v_training->>'pct')::INTEGER >= office.setting_int('trained_pct', 80) THEN
    PERFORM office.move_stage(p_account_id, 'trained', 'auto', 'Staff training complete');
  END IF;

  -- First patient registered = live.
  SELECT MIN(created_at) INTO v_first_patient
  FROM patients WHERE clinic_id = v_account.clinic_id AND retired_at IS NULL;

  IF v_first_patient IS NOT NULL THEN
    IF office.move_stage(p_account_id, 'live', 'auto', 'First patient registered') THEN
      INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, source, dedupe_key)
      VALUES (v_account.office_id, p_account_id, 'first_patient', v_account.name, 'system', 'first_patient:' || p_account_id)
      ON CONFLICT DO NOTHING;
      UPDATE office.tasks SET status = 'done', closed_at = NOW()
      WHERE clinic_account_id = p_account_id AND kind = 'go_live' AND status = 'open';
    END IF;

    -- Steady: live for the whole window, with visits on at least 5 of every 7 days of it.
    SELECT MIN(at) INTO v_live_since FROM office.clinic_stage_events
    WHERE clinic_account_id = p_account_id AND to_stage = 'live';
    SELECT COUNT(DISTINCT visit_date) INTO v_active_days
    FROM visits
    WHERE clinic_id = v_account.clinic_id AND visit_date > CURRENT_DATE - v_steady AND visit_date <= CURRENT_DATE;

    IF v_live_since <= NOW() - make_interval(days => v_steady)
       AND v_active_days >= CEIL(v_steady * 5.0 / 7) THEN
      PERFORM office.move_stage(p_account_id, 'steady', 'auto',
        format('Visits on %s of the last %s days', v_active_days, v_steady));
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- 4. Readiness link and the login-free form
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_onboarding_start(
  p_account_id UUID, p_champion_name TEXT DEFAULT NULL, p_champion_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_check office.readiness_checks;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer', 'sales']);

  UPDATE office.clinic_accounts SET
    champion_name = COALESCE(NULLIF(trim(p_champion_name), ''), champion_name),
    champion_phone = COALESCE(NULLIF(trim(p_champion_phone), ''), champion_phone),
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Reuse a live link so a re-share is the same link the champion already has.
  SELECT * INTO v_check FROM office.readiness_checks
  WHERE clinic_account_id = p_account_id AND status = 'sent' AND expires_at > NOW() + INTERVAL '1 day'
  ORDER BY created_at DESC LIMIT 1;

  IF v_check.id IS NULL THEN
    INSERT INTO office.readiness_checks (clinic_account_id, office_id, token, expires_at, created_by)
    VALUES (p_account_id, v_account.office_id, office.new_token(),
            NOW() + make_interval(days => office.setting_int('readiness_link_days', 14)),
            office.current_sub())
    RETURNING * INTO v_check;
  END IF;

  PERFORM office.move_stage(p_account_id, 'readiness', 'auto', 'Readiness form sent');
  RETURN jsonb_build_object('token', v_check.token, 'expires_at', v_check.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION office.readiness_by_token(p_token TEXT)
RETURNS office.readiness_checks
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_check office.readiness_checks;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_check FROM office.readiness_checks WHERE token = p_token;
  IF v_check.id IS NULL THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE = 'P0002'; END IF;
  IF v_check.expires_at < NOW() THEN RAISE EXCEPTION 'LINK_EXPIRED'; END IF;
  RETURN v_check;
END;
$$;

-- What the clinic champion's phone needs to draw the form. No login.
CREATE OR REPLACE FUNCTION public.office_readiness_form(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_check office.readiness_checks;
BEGIN
  v_check := office.readiness_by_token(p_token);
  RETURN jsonb_build_object(
    'check_id', v_check.id,
    'clinic_name', (SELECT name FROM office.clinic_accounts WHERE id = v_check.clinic_account_id),
    'office_name', (SELECT name FROM office.offices WHERE id = v_check.office_id),
    'status', v_check.status,
    'locked', v_check.status = 'reviewed',
    'answers', jsonb_build_object(
      'power', v_check.power, 'devices', v_check.devices, 'signal', v_check.signal,
      'staff', COALESCE(v_check.staff, '[]'::jsonb), 'services', v_check.services,
      'departments', v_check.departments, 'champion', v_check.champion),
    'photos', v_check.photos);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_readiness_submit(p_token TEXT, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_check office.readiness_checks;
  v_staff JSONB;
BEGIN
  v_check := office.readiness_by_token(p_token);
  IF v_check.status = 'reviewed' THEN RAISE EXCEPTION 'LINK_LOCKED'; END IF;
  IF pg_column_size(p_answers) > 60000 THEN RAISE EXCEPTION 'Too much data'; END IF;

  -- Keep only the staff fields we use, and cap the list.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', left(trim(s->>'name'), 120), 'role', left(trim(COALESCE(s->>'role', '')), 60),
           'phone', left(trim(COALESCE(s->>'phone', '')), 30), 'email', lower(left(trim(COALESCE(s->>'email', '')), 160)))), '[]'::jsonb)
    INTO v_staff
  FROM (SELECT s FROM jsonb_array_elements(COALESCE(p_answers->'staff', '[]'::jsonb)) s
        WHERE trim(COALESCE(s->>'name', '')) <> '' LIMIT 60) q;

  UPDATE office.readiness_checks SET
    power = p_answers->'power',
    devices = p_answers->'devices',
    signal = p_answers->'signal',
    staff = v_staff,
    services = ARRAY(SELECT left(jsonb_array_elements_text(COALESCE(p_answers->'services', '[]'::jsonb)), 80) LIMIT 40),
    departments = ARRAY(SELECT left(jsonb_array_elements_text(COALESCE(p_answers->'departments', '[]'::jsonb)), 40) LIMIT 10),
    champion = p_answers->'champion',
    status = 'submitted',
    submitted_at = NOW()
  WHERE id = v_check.id;

  UPDATE office.clinic_accounts SET
    champion_name = COALESCE(NULLIF(trim(p_answers->'champion'->>'name'), ''), champion_name),
    champion_phone = COALESCE(NULLIF(trim(p_answers->'champion'->>'phone'), ''), champion_phone),
    staff_count = GREATEST(COALESCE(staff_count, 0), jsonb_array_length(v_staff)),
    updated_at = NOW()
  WHERE id = v_check.clinic_account_id;

  -- The staff list the clinic typed becomes the staff draft for the partner to review.
  IF jsonb_array_length(v_staff) > 0 THEN
    INSERT INTO office.catalog_drafts (clinic_account_id, office_id, kind, rows, source)
    VALUES (v_check.clinic_account_id, v_check.office_id, 'staff', v_staff, 'form')
    ON CONFLICT (clinic_account_id, kind) WHERE status <> 'applied'
    DO UPDATE SET rows = EXCLUDED.rows, source = 'form', updated_at = NOW()
    WHERE office.catalog_drafts.status = 'draft';
  END IF;

  INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, source, dedupe_key)
  SELECT v_check.office_id, v_check.clinic_account_id, 'readiness_submitted', a.name, 'system',
         'readiness_submitted:' || v_check.id
  FROM office.clinic_accounts a WHERE a.id = v_check.clinic_account_id
  ON CONFLICT DO NOTHING;

  PERFORM office.refresh_account_progress(v_check.clinic_account_id);
  RETURN jsonb_build_object('received', TRUE);
END;
$$;

-- Registers a photo the form just uploaded to Storage.
CREATE OR REPLACE FUNCTION public.office_readiness_add_photo(p_token TEXT, p_kind TEXT, p_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_check office.readiness_checks;
BEGIN
  v_check := office.readiness_by_token(p_token);
  IF v_check.status = 'reviewed' THEN RAISE EXCEPTION 'LINK_LOCKED'; END IF;
  IF p_kind NOT IN ('price_list', 'drug_list', 'staff_roster', 'signal') THEN RAISE EXCEPTION 'Unknown photo kind'; END IF;
  IF p_path NOT LIKE v_check.id::TEXT || '/%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Bad photo path'; END IF;
  IF jsonb_array_length(v_check.photos) >= 20 THEN RAISE EXCEPTION 'PHOTO_LIMIT'; END IF;

  UPDATE office.readiness_checks
  SET photos = photos || jsonb_build_array(jsonb_build_object('kind', p_kind, 'path', p_path, 'at', NOW()))
  WHERE id = v_check.id
  RETURNING photos INTO v_check.photos;
  RETURN v_check.photos;
END;
$$;

-- Storage: a private bucket for readiness photos. Paths are <check_id>/<file>.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('office-readiness', 'office-readiness', FALSE, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.office_storage_readiness_can_write(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_id TEXT := split_part(p_name, '/', 1);
BEGIN
  IF v_id !~ '^[0-9a-f-]{36}$' OR p_name LIKE '%..%' THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM office.readiness_checks c
    WHERE c.id = v_id::UUID AND c.expires_at > NOW() AND c.status <> 'reviewed'
  ) AND (
    SELECT COUNT(*) FROM storage.objects o
    WHERE o.bucket_id = 'office-readiness' AND o.name LIKE v_id || '/%'
  ) < 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_storage_readiness_can_read(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_id TEXT := split_part(p_name, '/', 1);
  v_sub TEXT := auth.jwt()->>'sub';
BEGIN
  IF v_sub IS NULL OR v_id !~ '^[0-9a-f-]{36}$' THEN RETURN FALSE; END IF;
  RETURN office.is_central() OR EXISTS (
    SELECT 1 FROM office.readiness_checks c
    JOIN office.office_members m ON m.office_id = c.office_id
    WHERE c.id = v_id::UUID AND m.clerk_user_id = v_sub AND m.is_active);
END;
$$;

DROP POLICY IF EXISTS "office_readiness_upload" ON storage.objects;
CREATE POLICY "office_readiness_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'office-readiness' AND public.office_storage_readiness_can_write(name));

DROP POLICY IF EXISTS "office_readiness_read" ON storage.objects;
CREATE POLICY "office_readiness_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'office-readiness' AND public.office_storage_readiness_can_read(name));

-- ============================================================================
-- 5. Catalog drafts: photo -> draft -> human approval -> clinic
-- ============================================================================

CREATE OR REPLACE FUNCTION office.drug_code(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  -- Same derivation as apps/web/src/app/dashboard/admin/stock-import/actions.ts.
  SELECT COALESCE(NULLIF(left(trim(BOTH '_' FROM regexp_replace(upper(COALESCE(p_name, '')), '[^A-Z0-9]+', '_', 'g')), 40), ''), 'ITEM');
$$;

-- Writes an approved drug draft into the clinic's stock, the same way the
-- EHR's bulk stock import does. Internal: the caller has been authorized.
CREATE OR REPLACE FUNCTION office.apply_drug_catalog(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_draft office.catalog_drafts;
  v_clinic UUID;
  v_row JSONB;
  v_name TEXT; v_form TEXT; v_strength TEXT; v_unit TEXT; v_code TEXT;
  v_price INTEGER; v_qty NUMERIC;
  v_item UUID;
  v_created INTEGER := 0; v_updated INTEGER := 0; v_skipped INTEGER := 0;
BEGIN
  SELECT * INTO v_draft FROM office.catalog_drafts WHERE id = p_draft_id FOR UPDATE;
  SELECT clinic_id INTO v_clinic FROM office.clinic_accounts WHERE id = v_draft.clinic_account_id;
  IF v_clinic IS NULL OR v_draft.kind <> 'drugs' OR v_draft.status <> 'approved' THEN RETURN NULL; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_draft.rows) LOOP
    v_name := NULLIF(trim(v_row->>'name'), '');
    IF v_name IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_form := lower(COALESCE(NULLIF(trim(v_row->>'formulation'), ''), 'other'));
    IF v_form NOT IN ('tablet', 'capsule', 'liquid', 'syrup', 'suspension', 'injection', 'powder',
                      'inhaler', 'drops', 'cream', 'ointment', 'sachet', 'vial', 'patch', 'other') THEN
      v_form := 'other';
    END IF;
    v_strength := NULLIF(trim(v_row->>'strength'), '');
    v_unit := COALESCE(NULLIF(trim(v_row->>'unit'), ''), CASE WHEN v_form = 'other' THEN 'unit' ELSE v_form END);
    v_code := office.drug_code(v_name);
    v_price := NULLIF(regexp_replace(COALESCE(v_row->>'unit_price', ''), '[^0-9]', '', 'g'), '')::INTEGER;
    v_qty := COALESCE(NULLIF(regexp_replace(COALESCE(v_row->>'quantity', ''), '[^0-9.]', '', 'g'), '')::NUMERIC, 0);

    SELECT id INTO v_item FROM pharmacy_stock_items
    WHERE clinic_id = v_clinic AND drug_code = v_code AND formulation = v_form
      AND strength IS NOT DISTINCT FROM v_strength;

    IF v_item IS NULL THEN
      INSERT INTO pharmacy_stock_items (clinic_id, drug_code, drug_name, formulation, strength, unit, quantity_on_hand, unit_price_ugx)
      VALUES (v_clinic, v_code, v_name, v_form, v_strength, v_unit, 0, v_price)
      RETURNING id INTO v_item;
      v_created := v_created + 1;
    ELSE
      UPDATE pharmacy_stock_items
      SET drug_name = v_name, unit = v_unit, unit_price_ugx = COALESCE(v_price, unit_price_ugx),
          active = TRUE, is_unavailable = FALSE
      WHERE id = v_item;
      v_updated := v_updated + 1;
    END IF;

    IF v_qty > 0 THEN
      INSERT INTO pharmacy_stock_movements (stock_item_id, clinic_id, movement_type, quantity_delta, notes)
      VALUES (v_item, v_clinic, 'received', v_qty, 'Opening balance (Karibu Office onboarding)');
    END IF;
  END LOOP;

  UPDATE office.catalog_drafts
  SET status = 'applied', applied_at = NOW(),
      apply_result = jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped)
  WHERE id = p_draft_id;

  PERFORM office.audit(v_draft.office_id, 'catalog.drugs_applied', 'clinic_account', v_draft.clinic_account_id,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped));
  RETURN jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;

-- The EHR prices drugs per stock item and has one consultation fee per clinic.
-- It has no per-clinic price list for other services, so those rows stay on
-- the draft as the partner's record and are reported as not applied.
CREATE OR REPLACE FUNCTION office.apply_service_catalog(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_draft office.catalog_drafts;
  v_clinic UUID;
  v_fee INTEGER;
  v_other INTEGER;
BEGIN
  SELECT * INTO v_draft FROM office.catalog_drafts WHERE id = p_draft_id FOR UPDATE;
  SELECT clinic_id INTO v_clinic FROM office.clinic_accounts WHERE id = v_draft.clinic_account_id;
  IF v_clinic IS NULL OR v_draft.kind <> 'services' OR v_draft.status <> 'approved' THEN RETURN NULL; END IF;

  SELECT NULLIF(regexp_replace(COALESCE(r->>'price', ''), '[^0-9]', '', 'g'), '')::INTEGER INTO v_fee
  FROM jsonb_array_elements(v_draft.rows) r
  WHERE r->>'kind' = 'consultation' LIMIT 1;

  SELECT COUNT(*) INTO v_other FROM jsonb_array_elements(v_draft.rows) r
  WHERE COALESCE(r->>'kind', 'other') <> 'consultation';

  IF v_fee IS NOT NULL THEN
    INSERT INTO clinic_billing_rates (clinic_id, consultation_fee_ugx) VALUES (v_clinic, v_fee)
    ON CONFLICT (clinic_id) DO UPDATE SET consultation_fee_ugx = EXCLUDED.consultation_fee_ugx, updated_at = NOW();
  END IF;

  UPDATE office.catalog_drafts
  SET status = 'applied', applied_at = NOW(),
      apply_result = jsonb_build_object('consultation_fee', v_fee, 'not_applied', v_other)
  WHERE id = p_draft_id;

  PERFORM office.audit(v_draft.office_id, 'catalog.services_applied', 'clinic_account', v_draft.clinic_account_id,
    jsonb_build_object('consultation_fee', v_fee, 'not_applied', v_other));
  RETURN jsonb_build_object('consultation_fee', v_fee, 'not_applied', v_other);
END;
$$;

CREATE OR REPLACE FUNCTION office.apply_approved_drafts(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, kind FROM office.catalog_drafts
           WHERE clinic_account_id = p_account_id AND status = 'approved' AND kind IN ('drugs', 'services') LOOP
    IF r.kind = 'drugs' THEN PERFORM office.apply_drug_catalog(r.id);
    ELSE PERFORM office.apply_service_catalog(r.id); END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_catalog_draft_save(
  p_account_id UUID, p_kind TEXT, p_rows JSONB, p_source TEXT DEFAULT 'manual',
  p_source_photos JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_id UUID;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer']);
  IF p_kind NOT IN ('drugs', 'services', 'staff') THEN RAISE EXCEPTION 'Unknown catalog kind'; END IF;
  IF p_source NOT IN ('ai', 'manual', 'form') THEN RAISE EXCEPTION 'Unknown source'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 600 THEN
    RAISE EXCEPTION 'A catalog can have up to 600 rows';
  END IF;

  -- Editing after approval sends the draft back for approval.
  INSERT INTO office.catalog_drafts (clinic_account_id, office_id, kind, rows, source, source_photos)
  VALUES (p_account_id, v_account.office_id, p_kind, p_rows, p_source, COALESCE(p_source_photos, '[]'::jsonb))
  ON CONFLICT (clinic_account_id, kind) WHERE status <> 'applied'
  DO UPDATE SET rows = EXCLUDED.rows, source = EXCLUDED.source, source_photos = EXCLUDED.source_photos,
                status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = NOW()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('draft_id', v_id);
END;
$$;

-- A person approves; nothing extracted by AI reaches a clinic without this.
CREATE OR REPLACE FUNCTION public.office_catalog_draft_approve(p_account_id UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_draft office.catalog_drafts;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer']);
  SELECT * INTO v_draft FROM office.catalog_drafts
  WHERE clinic_account_id = p_account_id AND kind = p_kind AND status = 'draft' FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'Nothing to approve' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_array_length(v_draft.rows) = 0 THEN RAISE EXCEPTION 'The list is empty'; END IF;

  UPDATE office.catalog_drafts
  SET status = 'approved', approved_by = office.current_sub(), approved_at = NOW()
  WHERE id = v_draft.id;
  PERFORM office.audit(v_account.office_id, 'catalog.approved', 'clinic_account', p_account_id,
    jsonb_build_object('kind', p_kind, 'rows', jsonb_array_length(v_draft.rows), 'source', v_draft.source));

  -- If the clinic already exists, write it now. Otherwise provisioning does.
  PERFORM office.apply_approved_drafts(p_account_id);
  PERFORM office.refresh_account_progress(p_account_id);
  RETURN jsonb_build_object('status', (SELECT status FROM office.catalog_drafts WHERE id = v_draft.id));
END;
$$;

-- ============================================================================
-- 6. Provisioning and staff invites (office-scoped, no superadmin needed)
-- ============================================================================

-- The office app creates the Clerk organization first (with NO creator, so the
-- partner does not become a member of the clinic and never gets a staff row),
-- then calls this. If the Clerk webhook already inserted a bare clinic row for
-- that organization, this adopts it, but only when it is new, empty and unowned.
CREATE OR REPLACE FUNCTION public.office_clinic_provision(
  p_account_id UUID, p_slug TEXT, p_clerk_organization_id TEXT,
  p_departments TEXT[] DEFAULT ARRAY['opd'], p_timezone TEXT DEFAULT 'Africa/Kampala'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_clinic UUID;
  v_existing clinics;
  v_dept TEXT;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer']);
  PERFORM office.assert_can_provision(v_account.office_id);
  IF v_account.clinic_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PROVISIONED'; END IF;
  IF v_account.stage = 'churned' THEN RAISE EXCEPTION 'Clinic is marked as lost'; END IF;
  IF COALESCE(p_clerk_organization_id, '') = '' OR p_slug !~ '^[a-z0-9-]{3,60}$' THEN
    RAISE EXCEPTION 'A sign-in organization and a valid short name are required';
  END IF;

  SELECT * INTO v_existing FROM clinics WHERE clerk_organization_id = p_clerk_organization_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.created_at < NOW() - INTERVAL '15 minutes'
       OR EXISTS (SELECT 1 FROM office.clinic_accounts WHERE clinic_id = v_existing.id)
       OR EXISTS (SELECT 1 FROM staff WHERE clinic_id = v_existing.id)
       OR EXISTS (SELECT 1 FROM patients WHERE clinic_id = v_existing.id) THEN
      RAISE EXCEPTION 'That clinic already exists and cannot be claimed here' USING ERRCODE = '42501';
    END IF;
    UPDATE clinics SET name = v_account.name, slug = p_slug, timezone = p_timezone,
           district = v_account.district, level = v_account.facility_level,
           phone = v_account.contact_phone, is_active = TRUE
    WHERE id = v_existing.id;
    v_clinic := v_existing.id;
  ELSE
    INSERT INTO clinics (name, slug, timezone, district, level, phone, clerk_organization_id, is_active)
    VALUES (v_account.name, p_slug, p_timezone, v_account.district, v_account.facility_level,
            v_account.contact_phone, p_clerk_organization_id, TRUE)
    RETURNING id INTO v_clinic;
  END IF;

  FOREACH v_dept IN ARRAY COALESCE(p_departments, ARRAY['opd']) LOOP
    IF v_dept IN ('opd', 'anc', 'maternity', 'family_planning', 'immunization') THEN
      INSERT INTO clinic_departments (clinic_id, department) VALUES (v_clinic, v_dept)
      ON CONFLICT (clinic_id, department) DO NOTHING;
    END IF;
  END LOOP;

  INSERT INTO clinic_billing_rates (clinic_id) VALUES (v_clinic) ON CONFLICT (clinic_id) DO NOTHING;

  UPDATE office.clinic_accounts SET clinic_id = v_clinic, updated_at = NOW() WHERE id = p_account_id;
  PERFORM office.audit(v_account.office_id, 'clinic.provisioned', 'clinic_account', p_account_id,
    jsonb_build_object('clinic_id', v_clinic, 'slug', p_slug, 'departments', p_departments));

  PERFORM office.apply_approved_drafts(p_account_id);
  PERFORM office.move_stage(p_account_id, 'configured', 'auto', 'Clinic set up in Karibu');
  PERFORM office.refresh_account_progress(p_account_id);
  RETURN jsonb_build_object('clinic_id', v_clinic);
END;
$$;

-- Karibu central links a clinic that already exists in the EHR (e.g. one that
-- went live before offices existed) to an office's account.
CREATE OR REPLACE FUNCTION public.office_admin_clinic_link(p_account_id UUID, p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  PERFORM office.require_central();
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id FOR UPDATE;
  IF v_account.id IS NULL OR NOT EXISTS (SELECT 1 FROM clinics WHERE id = p_clinic_id) THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_account.clinic_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PROVISIONED'; END IF;

  UPDATE office.clinic_accounts SET clinic_id = p_clinic_id, updated_at = NOW() WHERE id = p_account_id;
  PERFORM office.audit(v_account.office_id, 'clinic.linked', 'clinic_account', p_account_id,
    jsonb_build_object('clinic_id', p_clinic_id));
  PERFORM office.move_stage(p_account_id, 'configured', 'auto', 'Linked to an existing Karibu clinic');
  PERFORM office.refresh_account_progress(p_account_id);
  RETURN jsonb_build_object('clinic_id', p_clinic_id);
END;
$$;

-- For the central console: clinics in the EHR that no office holds yet. Names only.
CREATE OR REPLACE FUNCTION public.office_admin_unlinked_clinics()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_central();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'district', c.district) ORDER BY c.name)
    FROM clinics c
    WHERE c.is_active AND NOT EXISTS (
      SELECT 1 FROM office.clinic_accounts a WHERE a.clinic_id = c.id AND a.stage <> 'churned')
  ), '[]'::jsonb);
END;
$$;

-- What the app needs to send a Clerk invitation for one of this office's clinics.
CREATE OR REPLACE FUNCTION public.office_clinic_signin_org(p_account_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer', 'support']);
  RETURN (SELECT clerk_organization_id FROM clinics WHERE id = v_account.clinic_id);
END;
$$;

-- Records an invitation the app just created in Clerk. The existing Clerk
-- webhook (apps/web) turns it into a staff row with this role on acceptance.
CREATE OR REPLACE FUNCTION public.office_staff_invite_record(
  p_account_id UUID, p_email TEXT, p_display_name TEXT, p_role TEXT, p_clerk_invitation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_org TEXT;
  v_email TEXT := lower(trim(p_email));
  v_id UUID;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer', 'support']);
  IF v_account.clinic_id IS NULL THEN RAISE EXCEPTION 'NOT_PROVISIONED'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'A valid email is required'; END IF;
  IF p_role NOT IN ('admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant',
                    'records_officer', 'lab_tech', 'dispenser') THEN
    RAISE EXCEPTION 'Unknown staff role';
  END IF;
  -- staff.clerk_user_id is unique, so a person works at one clinic. An office
  -- must not be able to pull someone out of a clinic it does not hold.
  IF EXISTS (SELECT 1 FROM staff WHERE lower(email) = v_email AND is_active AND clinic_id <> v_account.clinic_id) THEN
    RAISE EXCEPTION 'STAFF_AT_ANOTHER_CLINIC';
  END IF;
  SELECT clerk_organization_id INTO v_org FROM clinics WHERE id = v_account.clinic_id;

  UPDATE staff_invitations SET status = 'revoked'
  WHERE clinic_id = v_account.clinic_id AND email = v_email AND status = 'pending';
  DELETE FROM staff_invitations
  WHERE clinic_id = v_account.clinic_id AND email = v_email AND status = 'revoked';

  INSERT INTO staff_invitations (clinic_id, clerk_organization_id, clerk_invitation_id, email, display_name, role, status, invited_by_clerk_user_id)
  VALUES (v_account.clinic_id, v_org, p_clerk_invitation_id, v_email,
          COALESCE(NULLIF(trim(p_display_name), ''), split_part(v_email, '@', 1)), p_role, 'pending', office.current_sub())
  RETURNING id INTO v_id;

  PERFORM office.audit(v_account.office_id, 'staff.invited', 'clinic_account', p_account_id,
    jsonb_build_object('email', v_email, 'role', p_role));
  RETURN jsonb_build_object('invitation_id', v_id);
END;
$$;

-- ============================================================================
-- 7. The onboarding page, in one call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_onboarding_get(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_check office.readiness_checks;
BEGIN
  v_account := office.require_account(p_account_id);
  PERFORM office.refresh_account_progress(p_account_id);
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id;
  SELECT * INTO v_check FROM office.readiness_checks
  WHERE clinic_account_id = p_account_id ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'account', office.account_json(v_account),
    'can_provision', (SELECT o.status = 'active' FROM office.offices o WHERE o.id = v_account.office_id)
                     AND office.fee_status(v_account.office_id) <> 'lapsed',
    'readiness', CASE WHEN v_check.id IS NULL THEN NULL ELSE jsonb_build_object(
      'check_id', v_check.id, 'token', v_check.token, 'expires_at', v_check.expires_at,
      'expired', v_check.expires_at < NOW(), 'status', v_check.status,
      'submitted_at', v_check.submitted_at, 'power', v_check.power, 'devices', v_check.devices,
      'signal', v_check.signal, 'staff', v_check.staff, 'services', v_check.services,
      'departments', v_check.departments, 'champion', v_check.champion, 'photos', v_check.photos) END,
    'drafts', COALESCE((
      SELECT jsonb_object_agg(d.kind, jsonb_build_object(
        'id', d.id, 'rows', d.rows, 'source', d.source, 'status', d.status,
        'apply_result', d.apply_result, 'updated_at', d.updated_at))
      FROM (SELECT DISTINCT ON (kind) * FROM office.catalog_drafts
            WHERE clinic_account_id = p_account_id
            ORDER BY kind, (status <> 'applied') DESC, updated_at DESC) d), '{}'::jsonb),
    'training', office.staff_training(v_account.clinic_id),
    'score', office.readiness_score(p_account_id),
    'clinic', CASE WHEN v_account.clinic_id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('slug', c.slug, 'departments', (
        SELECT COALESCE(jsonb_agg(department), '[]'::jsonb) FROM clinic_departments WHERE clinic_id = c.id))
      FROM clinics c WHERE c.id = v_account.clinic_id) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.office_readiness_review(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'implementer']);
  UPDATE office.readiness_checks
  SET status = 'reviewed', reviewed_by = office.current_sub(), reviewed_at = NOW()
  WHERE clinic_account_id = p_account_id AND status = 'submitted';
  UPDATE office.tasks SET status = 'done', closed_at = NOW(), closed_by = office.current_sub()
  WHERE clinic_account_id = p_account_id AND kind = 'readiness_submitted' AND status = 'open';
END;
$$;

SELECT office.apply_rpc_grants(
  p_anon => ARRAY['office_public_profile', 'office_public_slugs', 'office_readiness_form',
                  'office_readiness_submit', 'office_readiness_add_photo',
                  'office_storage_readiness_can_write'],
  p_service_only => ARRAY['office_capture_lead']
);
