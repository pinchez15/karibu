-- Karibu Office: a register of health facilities, for finding leads.
--
-- A read-only reference list, loaded by Karibu (migration 121 seeds Uganda from
-- the Ministry of Health's 2018 master list). Offices search it and add a
-- facility to their pipeline, which goes through the same first-claim rule as
-- adding a clinic by hand (ADR-0002 §6): a facility another office holds shows
-- as held, never by whom.
--
-- Facilities are organisations, not people: no patient data is involved.

CREATE TABLE IF NOT EXISTS office.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  district TEXT NOT NULL,
  subcounty TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  -- As the source writes it: HC II, HC III, HC IV, Clinic, Hospital, RRH, NRH, SC.
  level TEXT,
  -- Who runs it: MOH, UCMB, UPMB, UMMB, Private and so on.
  authority TEXT,
  ownership TEXT CHECK (ownership IN ('GOVT', 'PFP', 'PNFP')),
  phone TEXT,
  -- Where the phone came from. 'google_maps_unverified' = looked up by a third party, never checked.
  phone_source TEXT,
  source TEXT NOT NULL,
  source_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_facilities
  ON office.facilities (country, office.name_key(district), office.name_key(subcounty), office.name_key(name));

-- The same key a claim is checked on, so "is this facility held?" is an index lookup.
CREATE INDEX IF NOT EXISTS idx_office_facilities_claim
  ON office.facilities (country, office.name_key(district), office.name_key(name));

ALTER TABLE office.facilities ENABLE ROW LEVEL SECURITY;

-- How well a facility fits what an office sells: 3 strong, 2 good, 1 low.
-- Government facilities buy through the district, not from an office, so they
-- rank low. Larger private and faith-based facilities rank highest.
CREATE OR REPLACE FUNCTION office.facility_fit(p_ownership TEXT, p_level TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_ownership = 'GOVT' THEN 1
    WHEN p_level IN ('HC III', 'HC IV', 'Hospital') THEN 3
    ELSE 2 END;
$$;

-- Search the register for the office's country.
-- p_filters: { q, district, levels[], ownership[], open_only, limit, offset }
CREATE OR REPLACE FUNCTION public.office_facilities_search(p_office_id UUID, p_filters JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_country TEXT;
  v_q TEXT := NULLIF(trim(COALESCE(p_filters->>'q', '')), '');
  v_district TEXT := NULLIF(trim(COALESCE(p_filters->>'district', '')), '');
  v_levels TEXT[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                          THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  v_ownership TEXT[] := CASE WHEN jsonb_typeof(p_filters->'ownership') = 'array' AND jsonb_array_length(p_filters->'ownership') > 0
                             THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'ownership')) END;
  v_open_only BOOLEAN := COALESCE((p_filters->>'open_only')::BOOLEAN, FALSE);
  v_limit INTEGER := LEAST(GREATEST(COALESCE((p_filters->>'limit')::INTEGER, 50), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE((p_filters->>'offset')::INTEGER, 0), 0);
  v_result JSONB;
BEGIN
  PERFORM office.require_member(p_office_id);
  SELECT country INTO v_country FROM office.offices WHERE id = p_office_id;

  WITH held AS (
    -- Every live claim in the country, reduced to its key and whether it is this office's.
    SELECT office.name_key(a.district) AS dk, office.name_key(a.name) AS nk,
           bool_or(a.office_id = p_office_id) AS mine,
           (array_agg(a.id) FILTER (WHERE a.office_id = p_office_id))[1] AS account_id
    FROM office.clinic_accounts a
    WHERE a.country = v_country AND a.stage <> 'churned'
    GROUP BY 1, 2
  ), live_districts AS (
    SELECT DISTINCT office.name_key(district) AS dk FROM office.clinic_accounts
    WHERE office_id = p_office_id AND stage IN ('live', 'steady', 'billed') AND district IS NOT NULL
  ), base AS (
    SELECT f.id, f.district, f.subcounty, f.name, f.level, f.authority, f.ownership, f.phone, f.phone_source,
           office.facility_fit(f.ownership, f.level) AS fit,
           CASE WHEN h.nk IS NULL THEN 'open' WHEN h.mine THEN 'yours' ELSE 'held' END AS status,
           h.account_id,
           (ld.dk IS NOT NULL) AS near
    FROM office.facilities f
    LEFT JOIN held h ON h.dk = office.name_key(f.district) AND h.nk = office.name_key(f.name)
    LEFT JOIN live_districts ld ON ld.dk = office.name_key(f.district)
    WHERE f.country = v_country
  ), filtered AS (
    SELECT * FROM base b
    WHERE (v_district IS NULL OR office.name_key(b.district) = office.name_key(v_district))
      AND (v_levels IS NULL OR b.level = ANY (v_levels))
      AND (v_ownership IS NULL OR b.ownership = ANY (v_ownership))
      AND (NOT v_open_only OR b.status = 'open')
      AND (v_q IS NULL OR b.name ILIKE '%' || v_q || '%' OR b.subcounty ILIKE '%' || v_q || '%' OR b.district ILIKE '%' || v_q || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'in_country', (SELECT COUNT(*) FROM base),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM (
        -- account_id is only ever this office's own account.
        SELECT id, district, subcounty, name, level, authority, ownership, phone, phone_source, fit, status, near,
               CASE WHEN status = 'yours' THEN account_id END AS account_id
        FROM filtered
        ORDER BY fit DESC, near DESC, district, name
        LIMIT v_limit OFFSET v_offset) r), '[]'::jsonb),
    'districts', COALESCE((
      SELECT jsonb_agg(d ORDER BY d->>'district') FROM (
        SELECT jsonb_build_object(
          'district', district, 'total', COUNT(*),
          'open', COUNT(*) FILTER (WHERE status = 'open' AND ownership <> 'GOVT'),
          'yours', COUNT(*) FILTER (WHERE status = 'yours'),
          'near', bool_or(near)) AS d
        FROM base GROUP BY district) q), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('source', source, 'year', source_year))
      FROM office.facilities WHERE country = v_country), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Add facilities from the register to the office's pipeline as leads. Each one
-- goes through office.claim_clinic, so the first-claim rule and the conflict
-- queue apply exactly as they do for a clinic typed in by hand.
CREATE OR REPLACE FUNCTION public.office_facilities_add(p_office_id UUID, p_facility_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.current_sub();
  v_country TEXT;
  f office.facilities;
  v_result JSONB;
  v_results JSONB := '[]'::jsonb;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'sales']);
  IF p_facility_ids IS NULL OR cardinality(p_facility_ids) = 0 THEN RETURN v_results; END IF;
  IF cardinality(p_facility_ids) > 50 THEN
    RAISE EXCEPTION 'TOO_MANY' USING HINT = 'Add up to 50 clinics at a time.';
  END IF;
  SELECT country INTO v_country FROM office.offices WHERE id = p_office_id;

  FOR f IN SELECT * FROM office.facilities WHERE id = ANY (p_facility_ids) AND country = v_country ORDER BY name LOOP
    BEGIN
      v_result := office.claim_clinic(p_office_id, jsonb_build_object(
        'name', f.name, 'district', f.district, 'facility_level', f.level, 'contact_phone', f.phone,
        'notes', concat_ws(E'\n',
          'From the ' || COALESCE(f.source_year::TEXT || ' ', '') || 'health facility register.',
          NULLIF('Sub-county: ' || f.subcounty, 'Sub-county: '),
          'Run by: ' || COALESCE(f.authority, '?') || ' (' || COALESCE(f.ownership, '?') || ').',
          CASE WHEN f.phone IS NOT NULL AND f.phone_source = 'google_maps_unverified'
               THEN 'The phone number was looked up online and has not been checked.' END)
      ), 'import', v_sub);
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object('status', 'error', 'name', f.name, 'message', SQLERRM);
    END;
    v_results := v_results || v_result;
  END LOOP;
  RETURN v_results;
END;
$$;

SELECT office.apply_rpc_grants(
  p_anon => ARRAY['office_public_profile', 'office_public_slugs', 'office_readiness_form',
                  'office_readiness_submit', 'office_readiness_add_photo',
                  'office_storage_readiness_can_write', 'office_invoice_public'],
  p_service_only => ARRAY['office_capture_lead', 'office_run_nightly']
);
