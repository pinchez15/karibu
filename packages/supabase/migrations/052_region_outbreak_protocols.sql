-- 052_region_outbreak_protocols.sql
--
-- Regional clinical protocols (e.g. the Ebola outbreak protocol).
--
-- Outbreaks like Ebola are tightly regional — they burn fast and local, with
-- fulminant presentation and short incubation. A national alert for a South-
-- Western outbreak would be both clinically imprecise and a source of alarm
-- fatigue elsewhere. So protocols are scoped to a DISTRICT (the unit Uganda's
-- MoH declares outbreaks in), with a DIOCESE shortcut, and are controlled by a
-- per-diocese COORDINATOR (the coordinating body running the response) — plus
-- platform superadmins.
--
-- The Android EHR reads its clinic's active protocols (on sync) and gates
-- outbreak clinical-decision-support on them: e.g. the interruptive Ebola alert
-- only fires when the clinic's district/diocese is on protocol. When the
-- outbreak ends, the coordinator turns it off and the app returns to baseline.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Diocese coordinators — per-diocese admins who run outbreak response.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diocese_coordinators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  diocese TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, diocese)
);
CREATE INDEX IF NOT EXISTS idx_diocese_coordinators_clerk_user_id
  ON diocese_coordinators(clerk_user_id);

ALTER TABLE diocese_coordinators ENABLE ROW LEVEL SECURITY;

-- A coordinator can read their own record (so the web app can resolve role).
-- Management (insert / deactivate) is done by a platform superadmin via the
-- service-role client in the web super-admin area.
DROP POLICY IF EXISTS "diocese_coordinators_select_self" ON diocese_coordinators;
CREATE POLICY "diocese_coordinators_select_self" ON diocese_coordinators
  FOR SELECT
  USING (clerk_user_id = auth.jwt()->>'sub');

DROP TRIGGER IF EXISTS update_diocese_coordinators_updated_at ON diocese_coordinators;
CREATE TRIGGER update_diocese_coordinators_updated_at
  BEFORE UPDATE ON diocese_coordinators
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Region protocols — the active/inactive outbreak protocols.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region_protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- 'ebola' for now; generic so 'cholera' / 'marburg' / 'mpox' slot in later.
  protocol TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('district', 'diocese')),
  scope_value TEXT NOT NULL, -- a district name, or a diocese name
  active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT, -- e.g. "WHO-declared SVD outbreak, Kasese district"
  activated_by TEXT, -- clerk_user_id
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_by TEXT,
  deactivated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (protocol, scope_type, scope_value)
);
CREATE INDEX IF NOT EXISTS idx_region_protocols_active
  ON region_protocols(active, scope_type, scope_value);

ALTER TABLE region_protocols ENABLE ROW LEVEL SECURITY;
-- All reads + writes go through the SECURITY DEFINER RPCs below (Clerk JWTs do
-- not work with auth.uid()-based RLS), so no broad table policies are needed.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Authorization helpers.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM superadmins
    WHERE clerk_user_id = auth.jwt()->>'sub' AND is_active
  );
$$;

-- A superadmin governs every diocese; a coordinator governs their own.
CREATE OR REPLACE FUNCTION is_diocese_coordinator(p_diocese TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM diocese_coordinators
    WHERE clerk_user_id = auth.jwt()->>'sub'
      AND diocese = p_diocese
      AND is_active
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC — the Android EHR reads its clinic's active protocols (on sync).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_active_protocols_for_clinic(p_clinic_id UUID)
RETURNS TABLE (
  protocol TEXT,
  scope_type TEXT,
  scope_value TEXT,
  note TEXT,
  activated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rp.protocol, rp.scope_type, rp.scope_value, rp.note, rp.activated_at
  FROM region_protocols rp
  JOIN clinics c ON c.id = p_clinic_id
  WHERE rp.active
    AND (
      (rp.scope_type = 'district' AND rp.scope_value = c.district)
      OR (rp.scope_type = 'diocese' AND rp.scope_value = c.diocese)
    );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC — a coordinator (or superadmin) turns a protocol on/off.
--    District scope is governed by that district's diocese (resolved via the
--    clinics in it). Named-region shortcuts are expanded to per-district calls
--    by the web layer.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_set_region_protocol(
  p_protocol TEXT,
  p_scope_type TEXT,
  p_scope_value TEXT,
  p_active BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS region_protocols
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT := auth.jwt()->>'sub';
  v_diocese TEXT;
  v_row region_protocols;
BEGIN
  IF p_scope_type NOT IN ('district', 'diocese') THEN
    RAISE EXCEPTION 'invalid scope_type: %', p_scope_type;
  END IF;

  -- Resolve the governing diocese for the authorization check.
  IF p_scope_type = 'diocese' THEN
    v_diocese := p_scope_value;
  ELSE
    SELECT diocese INTO v_diocese
    FROM clinics
    WHERE district = p_scope_value AND diocese IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_diocese IS NULL OR NOT is_diocese_coordinator(v_diocese) THEN
    RAISE EXCEPTION 'not authorized to manage protocol for % %',
      p_scope_type, p_scope_value;
  END IF;

  INSERT INTO region_protocols AS rp (
    protocol, scope_type, scope_value, active, note,
    activated_by, activated_at, updated_at
  )
  VALUES (
    p_protocol, p_scope_type, p_scope_value, p_active, p_note,
    v_uid, NOW(), NOW()
  )
  ON CONFLICT (protocol, scope_type, scope_value) DO UPDATE SET
    active = EXCLUDED.active,
    note = COALESCE(EXCLUDED.note, rp.note),
    updated_at = NOW(),
    activated_by = CASE WHEN EXCLUDED.active AND NOT rp.active
                        THEN v_uid ELSE rp.activated_by END,
    activated_at = CASE WHEN EXCLUDED.active AND NOT rp.active
                        THEN NOW() ELSE rp.activated_at END,
    deactivated_by = CASE WHEN NOT EXCLUDED.active AND rp.active
                          THEN v_uid ELSE rp.deactivated_by END,
    deactivated_at = CASE WHEN NOT EXCLUDED.active AND rp.active
                          THEN NOW() ELSE rp.deactivated_at END
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC — list protocols the caller may see (web super-admin / coordinator).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_list_region_protocols()
RETURNS SETOF region_protocols
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rp.*
  FROM region_protocols rp
  WHERE is_superadmin()
     OR EXISTS (
       SELECT 1 FROM diocese_coordinators dc
       WHERE dc.clerk_user_id = auth.jwt()->>'sub'
         AND dc.is_active
         AND (
           (rp.scope_type = 'diocese' AND rp.scope_value = dc.diocese)
           OR (rp.scope_type = 'district' AND rp.scope_value IN (
                SELECT district FROM clinics WHERE diocese = dc.diocese
           ))
         )
     )
  ORDER BY rp.active DESC, rp.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_active_protocols_for_clinic(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_set_region_protocol(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_list_region_protocols() TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_diocese_coordinator(TEXT) TO authenticated;
