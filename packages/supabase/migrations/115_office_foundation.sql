-- 115_office_foundation.sql
-- Karibu Office (docs/karibu-office-spec.md, docs/architecture/adr-0002-local-offices.md).
--
-- Business tools for local offices: the partners who sell, onboard, support
-- and bill clinics. This migration creates the `office` schema, every Phase 1
-- table (plus Phase 2/3 stubs so the model does not need reshaping later),
-- and the account / pipeline / Foundation-console RPCs.
--
-- Security model:
--   * The `office` schema is NOT exposed through PostgREST and no role but the
--     owner has USAGE on it. RLS is enabled with no policies as a second lock.
--   * Every read and write goes through public.office_* SECURITY DEFINER RPCs.
--   * The office app holds only the anon key + the user's Clerk JWT. It never
--     holds the service-role key, so it cannot read EHR tables at all.
--   * office_* RPCs return operational aggregates and staff names only. No
--     patient identifier may appear in any office_* return value
--     (packages/supabase/tests/office_no_phi.sql enforces this).
--   * Money is stored in minor units (BIGINT) with an ISO 4217 currency code.
--     UGX has no minor unit, so UGX 20,000 is stored as 20000.

CREATE SCHEMA IF NOT EXISTS office;
REVOKE ALL ON SCHEMA office FROM PUBLIC;
REVOKE ALL ON SCHEMA office FROM anon, authenticated;

-- ============================================================================
-- 1. Settings (thresholds Karibu central can change without a migration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO office.settings (key, value, note) VALUES
  ('fee_grace_days',        '30', 'Days after a fee month ends before the office is lapsed. Spec open question 9.'),
  ('stage5_live_clinics',   '10', 'Live clinics that make an office a regional operator. Spec open question 8.'),
  ('stage5_staff',          '3',  'Active non-owner members that make an office a regional operator.'),
  ('alert_no_sync_hours',   '48', 'Hours with no clinic activity before a no-sync alert.'),
  ('alert_drop_pct',        '50', 'Percent drop against the 14-day baseline that raises an alert.'),
  ('alert_training_days',   '7',  'Days after invite before incomplete training raises an alert.'),
  ('readiness_link_days',   '14', 'Days a readiness link stays valid.'),
  ('invoice_due_days',      '14', 'Days from issue to due date on a new invoice.'),
  ('steady_days',           '7',  'Consecutive days of visits that make a live clinic steady.'),
  ('trained_pct',           '80', 'Percent of clinic staff trained for the training check to pass.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION office.setting_int(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::INTEGER FROM office.settings WHERE key = p_key), p_default);
$$;

-- ============================================================================
-- 2. Offices and members
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  territory TEXT NOT NULL,
  legal_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  -- Shown on clinic-facing invoices only. Karibu never moves this money.
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Public storefront profile for /local/[office]: lead name, title, photo, bio.
  public_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Where public lead-form notifications go. Never returned to the public page.
  inquiry_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  -- Stage is derived from data (office.derive_stage). Central can pin it.
  stage_override SMALLINT CHECK (stage_override BETWEEN 1 AND 5),
  certified_at TIMESTAMPTZ,
  certified_by TEXT,
  -- Partner fee: amount per month in minor units. NULL fee_starts_on = not billed yet.
  fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  fee_starts_on DATE,
  invoice_prefix TEXT NOT NULL DEFAULT 'KO',
  next_invoice_seq INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office.office_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  -- NULL until the invited person signs in and accepts.
  clerk_user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'sales', 'implementer', 'support')),
  display_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- One-time join link, shared over WhatsApp. Cleared on accept.
  invite_token TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invited_by TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_office_members_sub
  ON office.office_members (clerk_user_id) WHERE is_active;

-- Descriptive only under first-claim-per-clinic (spec §14). Kept so district
-- exclusivity can be added later without reshaping.
CREATE TABLE IF NOT EXISTS office.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  districts TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. Clinic pipeline
-- ============================================================================

-- Normalizes a facility or district name so "Kitanda Health Centre III" and
-- "kitanda HC 3" claim the same clinic.
CREATE OR REPLACE FUNCTION office.name_key(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(COALESCE(p, '')), 'health\s+cent(re|er)', 'hc', 'g'),
          '\miv\M', '4', 'g'),
        '\miii\M', '3', 'g'),
      '\mii\M', '2', 'g'),
    '[^a-z0-9]+', '', 'g');
$$;

CREATE OR REPLACE FUNCTION office.stage_rank(p_stage TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'lead' THEN 1 WHEN 'contacted' THEN 2 WHEN 'demo' THEN 3
    WHEN 'readiness' THEN 4 WHEN 'configured' THEN 5 WHEN 'trained' THEN 6
    WHEN 'kit_delivered' THEN 7 WHEN 'live' THEN 8 WHEN 'steady' THEN 9
    WHEN 'billed' THEN 10 WHEN 'churned' THEN 0 END;
$$;

CREATE TABLE IF NOT EXISTS office.clinic_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE RESTRICT,
  -- NULL until the clinic is provisioned in the EHR.
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  country TEXT NOT NULL,
  name TEXT NOT NULL,
  district TEXT,
  facility_level TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  champion_name TEXT,
  champion_phone TEXT,
  champion_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN (
    'lead', 'contacted', 'demo', 'readiness', 'configured', 'trained',
    'kit_delivered', 'live', 'steady', 'billed', 'churned')),
  tier TEXT CHECK (tier IN ('core', 'full', 'pro')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'public_form', 'import', 'referral')),
  assigned_member_id UUID REFERENCES office.office_members(id) ON DELETE SET NULL,
  go_live_mode TEXT CHECK (go_live_mode IN ('site_visit', 'remote')),
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  notes TEXT,
  staff_count INTEGER,
  -- Set once, the first time the readiness score is green.
  readiness_cleared_at TIMESTAMPTZ,
  billing_starts_on DATE,
  -- Set by Karibu central when it allows a second clinic of the same name.
  claim_disambiguator TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- First claim per clinic: one live account per facility name + district in a
-- country, across ALL offices; and one live account per provisioned clinic.
CREATE UNIQUE INDEX IF NOT EXISTS uq_office_clinic_claim
  ON office.clinic_accounts (country, office.name_key(district), office.name_key(name), claim_disambiguator)
  WHERE stage <> 'churned';

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_clinic_owner
  ON office.clinic_accounts (clinic_id)
  WHERE clinic_id IS NOT NULL AND stage <> 'churned';

CREATE INDEX IF NOT EXISTS idx_office_clinic_accounts_office
  ON office.clinic_accounts (office_id, stage);

-- Milestone history. Drives grants, so `source` separates what a person
-- clicked from what the platform observed.
CREATE TABLE IF NOT EXISTS office.clinic_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_account_id UUID NOT NULL REFERENCES office.clinic_accounts(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto')),
  by_sub TEXT,
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_stage_events_account
  ON office.clinic_stage_events (clinic_account_id, at DESC);

-- A claim that hit another office's clinic. Karibu central resolves it.
CREATE TABLE IF NOT EXISTS office.claim_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  held_by_office_id UUID REFERENCES office.offices(id) ON DELETE SET NULL,
  held_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE SET NULL,
  proposed JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'allowed', 'denied')),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. Onboarding
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.readiness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_account_id UUID NOT NULL REFERENCES office.clinic_accounts(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  -- Opaque random capability for the login-free form. Not a patient surface.
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'submitted', 'reviewed')),
  power JSONB,          -- {source: grid|solar|generator|none, backup: bool, hours_per_day: n}
  devices JSONB,        -- {android_phones: n, tablets: n, computers: n, printer: bool}
  signal JSONB,         -- {network: text, bars: 0-5, down_kbps: n, tested_at: ts}
  staff JSONB,          -- [{name, role, phone, email}]
  services TEXT[],
  departments TEXT[],
  champion JSONB,       -- {name, phone}
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{kind: price_list|drug_list|staff_roster|signal, path}]
  submitted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_readiness_account
  ON office.readiness_checks (clinic_account_id, created_at DESC);

-- Draft catalogs extracted from photos (or typed), reviewed by the partner,
-- then applied to the clinic through office-scoped RPCs.
CREATE TABLE IF NOT EXISTS office.catalog_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_account_id UUID NOT NULL REFERENCES office.clinic_accounts(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('drugs', 'services', 'staff')),
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual', 'form')),
  source_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'applied')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  apply_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_catalog_open_draft
  ON office.catalog_drafts (clinic_account_id, kind) WHERE status <> 'applied';

-- ============================================================================
-- 5. Tasks, field visits, health snapshots, support
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  clinic_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'alert', 'ai', 'system')),
  -- Stops the nightly job from raising the same alert twice while it is open.
  dedupe_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_tasks_open_dedupe
  ON office.tasks (office_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_tasks_open
  ON office.tasks (office_id, due_at) WHERE status = 'open';

-- The office's own field visits to a clinic. Named site_visits so it is never
-- confused with the EHR's patient `visits`. `id` is generated on the phone so
-- an offline-queued log replays without duplicating.
CREATE TABLE IF NOT EXISTS office.site_visits (
  id UUID PRIMARY KEY,
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  clinic_account_id UUID NOT NULL REFERENCES office.clinic_accounts(id) ON DELETE CASCADE,
  member_id UUID REFERENCES office.office_members(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sales', 'onboarding', 'go_live', 'support', 'collection', 'check_in', 'call')),
  notes TEXT,
  at TIMESTAMPTZ NOT NULL,
  gps JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_site_visits_account
  ON office.site_visits (clinic_account_id, at DESC);

-- Nightly health snapshot per live clinic. Aggregates only.
CREATE TABLE IF NOT EXISTS office.clinic_health_daily (
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  score TEXT NOT NULL CHECK (score IN ('green', 'amber', 'red')),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, day)
);

CREATE TABLE IF NOT EXISTS office.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID REFERENCES office.offices(id) ON DELETE SET NULL,
  clinic_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE SET NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  raised_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'app' CHECK (channel IN ('app', 'whatsapp', 'phone')),
  category TEXT,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- App surface the ticket was raised from, and client version. No patient context.
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  escalated_to_karibu BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at TIMESTAMPTZ,
  escalation_note TEXT,
  ai_triage JSONB,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_office_tickets_office
  ON office.support_tickets (office_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS office.support_ticket_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES office.support_tickets(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('clinic', 'office', 'karibu')),
  author_sub TEXT,
  author_name TEXT,
  body TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. Money: invoices, payments, partner fee, grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE RESTRICT,
  clinic_account_id UUID NOT NULL REFERENCES office.clinic_accounts(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  -- [{kind: subscription|setup|training|other, description, quantity, unit_amount, amount}]
  lines JSONB NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  amount_paid BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'part_paid', 'paid', 'overdue', 'void')),
  sent_via TEXT,
  sent_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  -- URA EFRIS reference, if the office is VAT-registered. Spec open question 5.
  efris_reference TEXT,
  -- Capability for the clinic-facing invoice page (no login).
  public_token TEXT UNIQUE NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, number)
);

CREATE INDEX IF NOT EXISTS idx_office_invoices_office
  ON office.invoices (office_id, status, due_date);

-- One subscription invoice per clinic per period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_office_invoice_period
  ON office.invoices (clinic_account_id, period_start)
  WHERE period_start IS NOT NULL AND status <> 'void';

-- A record that money arrived. Karibu Office never moves money.
CREATE TABLE IF NOT EXISTS office.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE RESTRICT,
  clinic_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES office.invoices(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('momo_mtn', 'airtel', 'cash', 'bank')),
  reference TEXT,
  payer_phone TEXT,
  payer_name TEXT,
  paid_at TIMESTAMPTZ NOT NULL,
  -- The pasted SMS text or the statement row, kept verbatim as evidence.
  raw_evidence TEXT,
  -- NULL = unmatched. 'auto' = suggested by the matcher, 'manual' = chosen by the partner.
  matched_by TEXT CHECK (matched_by IN ('manual', 'auto')),
  -- A match counts toward the invoice only once the partner confirms it.
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pasting the same confirmation SMS twice must not double-count.
CREATE UNIQUE INDEX IF NOT EXISTS uq_office_payment_reference
  ON office.payments (office_id, method, reference) WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_payments_office
  ON office.payments (office_id, paid_at DESC);

-- Office -> Karibu. One row per office per month.
CREATE TABLE IF NOT EXISTS office.partner_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  period DATE NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'waived')),
  -- Where the money is earmarked. Spec §14: destination is not finally decided,
  -- so it is data, not schema.
  fund TEXT NOT NULL,
  reference TEXT,
  paid_at TIMESTAMPTZ,
  marked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, period)
);

CREATE TABLE IF NOT EXISTS office.grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  total BIGINT NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office.grant_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES office.grants(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'released')),
  verified_at TIMESTAMPTZ,
  -- What the platform observed: which clinics, which dates. Donor reporting reads this.
  evidence JSONB,
  released_at TIMESTAMPTZ,
  released_by TEXT,
  release_reference TEXT,
  UNIQUE (grant_id, milestone_key)
);

-- ============================================================================
-- 7. Audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID,
  actor_sub TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('member', 'central', 'system', 'public')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_audit_office ON office.audit_events (office_id, at DESC);

-- ============================================================================
-- 8. Phase 2 / 3 stubs (data model only; nothing reads or writes these yet)
-- ============================================================================

CREATE TABLE IF NOT EXISTS office.kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  clinic_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE SET NULL,
  contents JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'shipped', 'delivered', 'returned')),
  shipped_via TEXT,
  tracking TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kit_id UUID REFERENCES office.kits(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app_version TEXT,
  last_seen TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  queue_depth INTEGER,
  battery INTEGER
);

CREATE TABLE IF NOT EXISTS office.referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  member_id UUID REFERENCES office.office_members(id) ON DELETE SET NULL,
  code TEXT UNIQUE NOT NULL,
  channel TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES office.office_members(id) ON DELETE CASCADE,
  clinic_account_id UUID REFERENCES office.clinic_accounts(id) ON DELETE SET NULL,
  rule JSONB NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  period DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS office.one_on_ones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES office.offices(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES office.office_members(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES office.office_members(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- RLS on with no policies: nothing reaches these tables except SECURITY
-- DEFINER functions, even if the schema were exposed by mistake.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'office' LOOP
    EXECUTE format('ALTER TABLE office.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- 9. Identity and guard helpers (office schema, not callable through the API)
-- ============================================================================

CREATE OR REPLACE FUNCTION office.current_sub()
RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path = office, public, pg_temp
AS $$
DECLARE v_sub TEXT;
BEGIN
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL OR v_sub = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION office.is_central()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins
    WHERE clerk_user_id = auth.jwt()->>'sub' AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION office.require_central()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_sub TEXT := office.current_sub();
BEGIN
  IF NOT office.is_central() THEN
    RAISE EXCEPTION 'Karibu central only' USING ERRCODE = '42501';
  END IF;
  RETURN v_sub;
END;
$$;

-- Returns the caller's member id for this office. Central passes with NULL.
-- p_roles NULL = any active member.
CREATE OR REPLACE FUNCTION office.require_member(p_office_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.current_sub();
  v_id UUID;
  v_role TEXT;
BEGIN
  SELECT id, role INTO v_id, v_role
  FROM office.office_members
  WHERE office_id = p_office_id AND clerk_user_id = v_sub AND is_active;

  IF v_id IS NULL THEN
    IF office.is_central() THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'Not a member of this office' USING ERRCODE = '42501';
  END IF;
  IF p_roles IS NOT NULL AND NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'Your role cannot do this' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$$;

-- Resolves an account to its office and checks membership in one step.
CREATE OR REPLACE FUNCTION office.require_account(p_account_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS office.clinic_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM office.require_member(v_account.office_id, p_roles);
  RETURN v_account;
END;
$$;

CREATE OR REPLACE FUNCTION office.audit(
  p_office_id UUID, p_action TEXT, p_resource_type TEXT, p_resource_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := auth.jwt()->>'sub';
BEGIN
  INSERT INTO office.audit_events (office_id, actor_sub, actor_kind, action, resource_type, resource_id, metadata)
  VALUES (
    p_office_id, v_sub,
    CASE WHEN v_sub IS NULL THEN 'system' WHEN office.is_central() THEN 'central' ELSE 'member' END,
    p_action, p_resource_type, p_resource_id, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION office.new_token()
RETURNS TEXT
LANGUAGE sql VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_');
$$;

-- ============================================================================
-- 10. Partner fee
-- ============================================================================

-- Creates the fee rows an office owes up to the current month.
CREATE OR REPLACE FUNCTION office.ensure_fee_periods(p_office_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_office office.offices;
BEGIN
  SELECT * INTO v_office FROM office.offices WHERE id = p_office_id;
  IF v_office.fee_starts_on IS NULL OR v_office.fee_amount = 0 THEN RETURN; END IF;

  INSERT INTO office.partner_fees (office_id, period, amount, currency, fund)
  SELECT p_office_id, m::DATE, v_office.fee_amount, v_office.currency,
         'network_fund:' || v_office.country
  FROM generate_series(
    date_trunc('month', v_office.fee_starts_on::TIMESTAMP),
    date_trunc('month', CURRENT_DATE::TIMESTAMP),
    INTERVAL '1 month') AS m
  ON CONFLICT (office_id, period) DO NOTHING;
END;
$$;

-- not_started | current | due | lapsed
CREATE OR REPLACE FUNCTION office.fee_status(p_office_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_starts DATE;
  v_oldest_due DATE;
BEGIN
  SELECT fee_starts_on INTO v_starts FROM office.offices WHERE id = p_office_id;
  IF v_starts IS NULL THEN RETURN 'not_started'; END IF;

  SELECT MIN(period) INTO v_oldest_due
  FROM office.partner_fees WHERE office_id = p_office_id AND status = 'due';

  IF v_oldest_due IS NULL THEN RETURN 'current'; END IF;
  IF (v_oldest_due + INTERVAL '1 month' + make_interval(days => office.setting_int('fee_grace_days', 30))) < CURRENT_DATE THEN
    RETURN 'lapsed';
  END IF;
  RETURN 'due';
END;
$$;

-- Fee lapse rule (spec 7.A): a lapsed office cannot provision NEW clinics.
-- Existing clinics are never interrupted, so nothing else checks this.
CREATE OR REPLACE FUNCTION office.assert_can_provision(p_office_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_status TEXT;
BEGIN
  -- Fee rows are created on demand, so make sure they exist before judging.
  PERFORM office.ensure_fee_periods(p_office_id);
  SELECT status INTO v_status FROM office.offices WHERE id = p_office_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'OFFICE_NOT_ACTIVE' USING HINT = 'Karibu central has not activated this office yet.';
  END IF;
  IF office.fee_status(p_office_id) = 'lapsed' THEN
    RAISE EXCEPTION 'PARTNER_FEE_LAPSED' USING HINT = 'Pay the partner fee to set up new clinics. Existing clinics are not affected.';
  END IF;
END;
$$;

-- ============================================================================
-- 11. Stage
-- ============================================================================

CREATE OR REPLACE FUNCTION office.derive_stage(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_override SMALLINT;
  v_cleared INTEGER;
  v_live INTEGER;
  v_invoiced INTEGER;
  v_staff INTEGER;
  v_stage INTEGER := 1;
BEGIN
  SELECT stage_override INTO v_override FROM office.offices WHERE id = p_office_id;

  SELECT COUNT(*) FILTER (WHERE readiness_cleared_at IS NOT NULL),
         COUNT(*) FILTER (WHERE stage IN ('live', 'steady', 'billed'))
    INTO v_cleared, v_live
  FROM office.clinic_accounts WHERE office_id = p_office_id AND stage <> 'churned';

  SELECT COUNT(*) INTO v_invoiced
  FROM office.invoices WHERE office_id = p_office_id AND status NOT IN ('draft', 'void');

  SELECT COUNT(*) INTO v_staff
  FROM office.office_members
  WHERE office_id = p_office_id AND is_active AND role <> 'owner' AND clerk_user_id IS NOT NULL;

  IF v_cleared > 0 OR v_live > 0 THEN v_stage := 2; END IF;
  IF v_invoiced > 0 THEN v_stage := 3; END IF;
  IF v_staff > 0 THEN v_stage := GREATEST(v_stage, 4); END IF;
  IF v_live >= office.setting_int('stage5_live_clinics', 10)
     OR v_staff >= office.setting_int('stage5_staff', 3) THEN
    v_stage := 5;
  END IF;

  RETURN jsonb_build_object(
    'stage', COALESCE(v_override, v_stage),
    'derived_stage', v_stage,
    'overridden', v_override IS NOT NULL,
    'readiness_cleared', v_cleared,
    'live_clinics', v_live,
    'invoices_issued', v_invoiced,
    'staff', v_staff
  );
END;
$$;

-- Moves an account to a stage and records the event. Auto moves only go forward.
CREATE OR REPLACE FUNCTION office.move_stage(
  p_account_id UUID, p_to TEXT, p_source TEXT, p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id FOR UPDATE;
  IF v_account.stage = p_to THEN RETURN FALSE; END IF;
  IF p_source = 'auto' AND (
       v_account.stage = 'churned'
       OR office.stage_rank(p_to) <= office.stage_rank(v_account.stage)) THEN
    RETURN FALSE;
  END IF;

  UPDATE office.clinic_accounts SET stage = p_to, updated_at = NOW() WHERE id = p_account_id;
  INSERT INTO office.clinic_stage_events (clinic_account_id, office_id, from_stage, to_stage, source, by_sub, note)
  VALUES (p_account_id, v_account.office_id, v_account.stage, p_to, p_source,
          CASE WHEN p_source = 'manual' THEN auth.jwt()->>'sub' END, p_note);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- 12. RPCs: identity, office account, members
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_me()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_sub TEXT := office.current_sub();
BEGIN
  RETURN jsonb_build_object(
    'is_central', office.is_central(),
    -- Central can open any office; members only see their own.
    'all_offices', CASE WHEN office.is_central() THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('office_id', id, 'slug', slug, 'name', name, 'status', status) ORDER BY name)
      FROM office.offices), '[]'::jsonb) ELSE '[]'::jsonb END,
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'member_id', m.id, 'office_id', o.id, 'slug', o.slug, 'name', o.name,
        'role', m.role, 'status', o.status) ORDER BY o.name)
      FROM office.office_members m
      JOIN office.offices o ON o.id = m.office_id
      WHERE m.clerk_user_id = v_sub AND m.is_active AND o.status <> 'closed'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION office.office_json(p_office office.offices)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p_office.id, 'slug', p_office.slug, 'name', p_office.name,
    'country', p_office.country, 'currency', p_office.currency,
    'territory', p_office.territory, 'legal_name', p_office.legal_name,
    'contact_name', p_office.contact_name, 'contact_phone', p_office.contact_phone,
    'contact_email', p_office.contact_email, 'payout_details', p_office.payout_details,
    'public_profile', p_office.public_profile, 'status', p_office.status,
    'certified_at', p_office.certified_at, 'fee_amount', p_office.fee_amount,
    'fee_starts_on', p_office.fee_starts_on, 'invoice_prefix', p_office.invoice_prefix,
    'created_at', p_office.created_at
  );
$$;

-- Everything the home screen needs in one round trip (3G: one request).
CREATE OR REPLACE FUNCTION public.office_home(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_office office.offices;
  v_member_id UUID;
BEGIN
  v_member_id := office.require_member(p_office_id);
  SELECT * INTO v_office FROM office.offices WHERE id = p_office_id;
  IF v_office.id IS NULL THEN RAISE EXCEPTION 'Office not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM office.ensure_fee_periods(p_office_id);

  RETURN jsonb_build_object(
    'office', office.office_json(v_office),
    'member_id', v_member_id,
    'role', (SELECT role FROM office.office_members WHERE id = v_member_id),
    'stage', office.derive_stage(p_office_id),
    'fee_status', office.fee_status(p_office_id),
    'counts', (
      SELECT jsonb_build_object(
        'pipeline', COUNT(*) FILTER (WHERE office.stage_rank(stage) BETWEEN 1 AND 3),
        'onboarding', COUNT(*) FILTER (WHERE office.stage_rank(stage) BETWEEN 4 AND 7),
        'live', COUNT(*) FILTER (WHERE office.stage_rank(stage) >= 8))
      FROM office.clinic_accounts WHERE office_id = p_office_id),
    'invoices', (
      SELECT jsonb_build_object(
        'overdue', COUNT(*) FILTER (WHERE status IN ('sent', 'part_paid', 'overdue') AND due_date < CURRENT_DATE),
        'outstanding', COALESCE(SUM(amount - amount_paid) FILTER (WHERE status IN ('sent', 'part_paid', 'overdue')), 0))
      FROM office.invoices WHERE office_id = p_office_id),
    'unmatched_payments', (
      SELECT COUNT(*) FROM office.payments WHERE office_id = p_office_id AND confirmed_at IS NULL),
    'open_tickets', (
      SELECT COUNT(*) FROM office.support_tickets
      WHERE office_id = p_office_id AND status IN ('open', 'in_progress')),
    'tasks', COALESCE((
      SELECT jsonb_agg(t ORDER BY (t->>'due_at') NULLS LAST, t->>'created_at')
      FROM (
        SELECT jsonb_build_object(
          'id', t.id, 'kind', t.kind, 'title', t.title, 'detail', t.detail,
          'due_at', t.due_at, 'source', t.source, 'created_at', t.created_at,
          'clinic_account_id', t.clinic_account_id, 'clinic_name', a.name) AS t
        FROM office.tasks t
        LEFT JOIN office.clinic_accounts a ON a.id = t.clinic_account_id
        WHERE t.office_id = p_office_id AND t.status = 'open'
        ORDER BY t.due_at NULLS LAST, t.created_at
        LIMIT 50) q
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.office_stage_thresholds()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'clinics', office.setting_int('stage5_live_clinics', 10),
    'staff', office.setting_int('stage5_staff', 3));
$$;

CREATE OR REPLACE FUNCTION public.office_update_profile(p_office_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_office office.offices;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  UPDATE office.offices SET
    legal_name     = CASE WHEN p_patch ? 'legal_name' THEN NULLIF(trim(p_patch->>'legal_name'), '') ELSE legal_name END,
    contact_name   = CASE WHEN p_patch ? 'contact_name' THEN NULLIF(trim(p_patch->>'contact_name'), '') ELSE contact_name END,
    contact_phone  = CASE WHEN p_patch ? 'contact_phone' THEN NULLIF(trim(p_patch->>'contact_phone'), '') ELSE contact_phone END,
    contact_email  = CASE WHEN p_patch ? 'contact_email' THEN NULLIF(trim(p_patch->>'contact_email'), '') ELSE contact_email END,
    payout_details = CASE WHEN p_patch ? 'payout_details' THEN COALESCE(p_patch->'payout_details', '{}'::jsonb) ELSE payout_details END,
    updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_office;
  PERFORM office.audit(p_office_id, 'office.profile_updated', 'office', p_office_id, jsonb_build_object('fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)));
  RETURN office.office_json(v_office);
END;
$$;

-- Creates a one-time join link. Central invites the first owner; an owner
-- invites their team (Phase 3 UI; the RPC is here so the model is complete).
CREATE OR REPLACE FUNCTION public.office_member_invite(
  p_office_id UUID, p_role TEXT, p_display_name TEXT, p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_token TEXT := office.new_token();
  v_id UUID;
BEGIN
  IF p_role = 'owner' THEN
    PERFORM office.require_central();
  ELSE
    PERFORM office.require_member(p_office_id, ARRAY['owner']);
  END IF;
  IF COALESCE(trim(p_display_name), '') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  INSERT INTO office.office_members (office_id, role, display_name, phone, invite_token, invite_expires_at, invited_by)
  VALUES (p_office_id, p_role, trim(p_display_name), NULLIF(trim(p_phone), ''), v_token, NOW() + INTERVAL '14 days', auth.jwt()->>'sub')
  RETURNING id INTO v_id;

  PERFORM office.audit(p_office_id, 'member.invited', 'office_member', v_id, jsonb_build_object('role', p_role));
  RETURN jsonb_build_object('member_id', v_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_member_accept(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.current_sub();
  v_member office.office_members;
BEGIN
  SELECT * INTO v_member FROM office.office_members
  WHERE invite_token = p_token AND clerk_user_id IS NULL AND is_active
  FOR UPDATE;

  IF v_member.id IS NULL OR v_member.invite_expires_at < NOW() THEN
    RAISE EXCEPTION 'INVITE_INVALID' USING HINT = 'This link has expired or was already used. Ask for a new one.';
  END IF;
  IF EXISTS (SELECT 1 FROM office.office_members WHERE office_id = v_member.office_id AND clerk_user_id = v_sub) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING HINT = 'You are already a member of this office.';
  END IF;

  UPDATE office.office_members
  SET clerk_user_id = v_sub, invite_token = NULL, invite_expires_at = NULL, accepted_at = NOW()
  WHERE id = v_member.id;

  PERFORM office.audit(v_member.office_id, 'member.accepted', 'office_member', v_member.id);
  RETURN jsonb_build_object('office_id', v_member.office_id, 'role', v_member.role);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_members_list(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'role', role, 'display_name', display_name, 'phone', phone,
      'is_active', is_active, 'joined', clerk_user_id IS NOT NULL,
      'invite_pending', invite_token IS NOT NULL AND invite_expires_at > NOW()) ORDER BY created_at)
    FROM office.office_members WHERE office_id = p_office_id
  ), '[]'::jsonb);
END;
$$;

-- ============================================================================
-- 13. RPCs: clinic pipeline
-- ============================================================================

CREATE OR REPLACE FUNCTION office.account_json(a office.clinic_accounts)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'office_id', a.office_id, 'clinic_id', a.clinic_id, 'name', a.name,
    'district', a.district, 'facility_level', a.facility_level,
    'contact_name', a.contact_name, 'contact_phone', a.contact_phone,
    'champion_name', a.champion_name, 'champion_phone', a.champion_phone,
    'stage', a.stage, 'tier', a.tier, 'source', a.source,
    'assigned_member_id', a.assigned_member_id,
    'assigned_member', (SELECT display_name FROM office.office_members WHERE id = a.assigned_member_id),
    'go_live_mode', a.go_live_mode, 'next_action', a.next_action,
    'next_action_at', a.next_action_at, 'last_contact_at', a.last_contact_at,
    'notes', a.notes, 'staff_count', a.staff_count,
    'readiness_cleared_at', a.readiness_cleared_at, 'billing_starts_on', a.billing_starts_on,
    'created_at', a.created_at,
    'health', (
      SELECT jsonb_build_object('score', h.score, 'reasons', h.reasons, 'day', h.day)
      FROM office.clinic_health_daily h
      WHERE h.clinic_id = a.clinic_id ORDER BY h.day DESC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.office_clinics_list(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id);
  RETURN COALESCE((
    SELECT jsonb_agg(office.account_json(a) ORDER BY office.stage_rank(a.stage) DESC, a.name)
    FROM office.clinic_accounts a WHERE a.office_id = p_office_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_clinic_get(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  v_account := office.require_account(p_account_id);
  RETURN jsonb_build_object(
    'account', office.account_json(v_account),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'from', from_stage, 'to', to_stage, 'source', source, 'note', note, 'at', at) ORDER BY at DESC)
      FROM office.clinic_stage_events WHERE clinic_account_id = p_account_id), '[]'::jsonb),
    'tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'title', title, 'detail', detail, 'due_at', due_at, 'source', source)
        ORDER BY due_at NULLS LAST, created_at)
      FROM office.tasks WHERE clinic_account_id = p_account_id AND status = 'open'), '[]'::jsonb),
    'site_visits', COALESCE((
      SELECT jsonb_agg(v ORDER BY v->>'at' DESC) FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'kind', s.kind, 'notes', s.notes, 'at', s.at,
          'member', (SELECT display_name FROM office.office_members WHERE id = s.member_id)) AS v
        FROM office.site_visits s WHERE s.clinic_account_id = p_account_id
        ORDER BY s.at DESC LIMIT 20) q), '[]'::jsonb)
  );
END;
$$;

-- Inserts an account, or records a conflict when another office already holds
-- the clinic. Internal: callers have already been authorized.
CREATE OR REPLACE FUNCTION office.claim_clinic(
  p_office_id UUID, p_fields JSONB, p_source TEXT, p_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_office office.offices;
  v_name TEXT := NULLIF(trim(p_fields->>'name'), '');
  v_district TEXT := NULLIF(trim(p_fields->>'district'), '');
  v_tier TEXT := NULLIF(p_fields->>'tier', '');
  v_holder office.clinic_accounts;
  v_id UUID;
  v_conflict UUID;
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'Clinic name is required'; END IF;
  IF v_tier IS NOT NULL AND v_tier NOT IN ('core', 'full', 'pro') THEN v_tier := NULL; END IF;
  SELECT * INTO v_office FROM office.offices WHERE id = p_office_id;

  SELECT * INTO v_holder FROM office.clinic_accounts
  WHERE country = v_office.country
    AND office.name_key(district) = office.name_key(v_district)
    AND office.name_key(name) = office.name_key(v_name)
    AND claim_disambiguator = ''
    AND stage <> 'churned'
  LIMIT 1;

  IF v_holder.id IS NOT NULL THEN
    IF v_holder.office_id = p_office_id THEN
      RETURN jsonb_build_object('status', 'duplicate', 'account_id', v_holder.id, 'name', v_name);
    END IF;
    INSERT INTO office.claim_conflicts (office_id, held_by_office_id, held_account_id, proposed, created_by)
    VALUES (p_office_id, v_holder.office_id, v_holder.id, p_fields || jsonb_build_object('source', p_source), p_by)
    RETURNING id INTO v_conflict;
    PERFORM office.audit(p_office_id, 'clinic.claim_conflict', 'claim_conflict', v_conflict,
      jsonb_build_object('name', v_name, 'district', v_district));
    -- The holder's identity is not disclosed to the claiming office.
    RETURN jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict, 'name', v_name);
  END IF;

  INSERT INTO office.clinic_accounts (
    office_id, country, name, district, facility_level, contact_name, contact_phone,
    tier, source, notes, staff_count, created_by, claim_disambiguator)
  VALUES (
    p_office_id, v_office.country, v_name, v_district,
    NULLIF(trim(p_fields->>'facility_level'), ''),
    NULLIF(trim(p_fields->>'contact_name'), ''),
    NULLIF(trim(p_fields->>'contact_phone'), ''),
    v_tier, p_source, NULLIF(trim(p_fields->>'notes'), ''),
    NULLIF(regexp_replace(COALESCE(p_fields->>'staff_count', ''), '\D', '', 'g'), '')::INTEGER,
    p_by, COALESCE(p_fields->>'claim_disambiguator', ''))
  RETURNING id INTO v_id;

  INSERT INTO office.clinic_stage_events (clinic_account_id, office_id, from_stage, to_stage, source, by_sub)
  VALUES (v_id, p_office_id, NULL, 'lead', CASE WHEN p_by IS NULL THEN 'auto' ELSE 'manual' END, p_by);

  RETURN jsonb_build_object('status', 'created', 'account_id', v_id, 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_clinic_create(p_office_id UUID, p_fields JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'sales']);
  RETURN office.claim_clinic(p_office_id, p_fields - 'claim_disambiguator', 'manual', office.current_sub());
END;
$$;

-- CSV import: the app parses the file, this claims each row. Returns one
-- result per row so the partner sees exactly what was skipped and why.
CREATE OR REPLACE FUNCTION public.office_clinics_import(p_office_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.current_sub();
  v_row JSONB;
  v_results JSONB := '[]'::jsonb;
  v_result JSONB;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'sales']);
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Import up to 500 rows at a time';
  END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      v_result := office.claim_clinic(p_office_id, v_row - 'claim_disambiguator', 'import', v_sub);
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object('status', 'error', 'name', v_row->>'name', 'message', SQLERRM);
    END;
    v_results := v_results || v_result;
  END LOOP;
  RETURN v_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_clinic_update(p_account_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_tier TEXT;
  v_assignee UUID;
BEGIN
  v_account := office.require_account(p_account_id);
  v_tier := NULLIF(p_patch->>'tier', '');
  IF v_tier IS NOT NULL AND v_tier NOT IN ('core', 'full', 'pro') THEN RAISE EXCEPTION 'Unknown tier'; END IF;
  IF p_patch ? 'assigned_member_id' AND NULLIF(p_patch->>'assigned_member_id', '') IS NOT NULL THEN
    SELECT id INTO v_assignee FROM office.office_members
    WHERE id = (p_patch->>'assigned_member_id')::UUID AND office_id = v_account.office_id AND is_active;
    IF v_assignee IS NULL THEN RAISE EXCEPTION 'That person is not on this office''s team'; END IF;
  END IF;

  -- name and district are not editable here: they are the claim key.
  UPDATE office.clinic_accounts SET
    facility_level  = CASE WHEN p_patch ? 'facility_level' THEN NULLIF(trim(p_patch->>'facility_level'), '') ELSE facility_level END,
    contact_name    = CASE WHEN p_patch ? 'contact_name' THEN NULLIF(trim(p_patch->>'contact_name'), '') ELSE contact_name END,
    contact_phone   = CASE WHEN p_patch ? 'contact_phone' THEN NULLIF(trim(p_patch->>'contact_phone'), '') ELSE contact_phone END,
    champion_name   = CASE WHEN p_patch ? 'champion_name' THEN NULLIF(trim(p_patch->>'champion_name'), '') ELSE champion_name END,
    champion_phone  = CASE WHEN p_patch ? 'champion_phone' THEN NULLIF(trim(p_patch->>'champion_phone'), '') ELSE champion_phone END,
    tier            = CASE WHEN p_patch ? 'tier' THEN v_tier ELSE tier END,
    go_live_mode    = CASE WHEN p_patch ? 'go_live_mode' THEN NULLIF(p_patch->>'go_live_mode', '') ELSE go_live_mode END,
    next_action     = CASE WHEN p_patch ? 'next_action' THEN NULLIF(trim(p_patch->>'next_action'), '') ELSE next_action END,
    next_action_at  = CASE WHEN p_patch ? 'next_action_at' THEN NULLIF(p_patch->>'next_action_at', '')::TIMESTAMPTZ ELSE next_action_at END,
    notes           = CASE WHEN p_patch ? 'notes' THEN NULLIF(trim(p_patch->>'notes'), '') ELSE notes END,
    billing_starts_on = CASE WHEN p_patch ? 'billing_starts_on' THEN NULLIF(p_patch->>'billing_starts_on', '')::DATE ELSE billing_starts_on END,
    assigned_member_id = CASE WHEN p_patch ? 'assigned_member_id' THEN v_assignee ELSE assigned_member_id END,
    updated_at = NOW()
  WHERE id = p_account_id
  RETURNING * INTO v_account;
  RETURN office.account_json(v_account);
END;
$$;

-- People move a clinic through the sales and preparation stages. live, steady
-- and billed are only ever set by the platform from what it observes, because
-- grant milestones are verified from them.
CREATE OR REPLACE FUNCTION public.office_clinic_set_stage(p_account_id UUID, p_stage TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_account office.clinic_accounts;
BEGIN
  v_account := office.require_account(p_account_id);
  IF p_stage NOT IN ('lead', 'contacted', 'demo', 'readiness', 'configured', 'trained', 'kit_delivered', 'churned') THEN
    RAISE EXCEPTION 'STAGE_IS_AUTOMATIC' USING HINT = 'Live, steady and billed are set by Karibu from clinic activity.';
  END IF;
  IF office.stage_rank(v_account.stage) >= 8 AND p_stage <> 'churned' THEN
    RAISE EXCEPTION 'STAGE_IS_AUTOMATIC' USING HINT = 'This clinic is already live.';
  END IF;
  PERFORM office.move_stage(p_account_id, p_stage, 'manual', p_note);
  IF p_stage = 'churned' THEN
    PERFORM office.audit(v_account.office_id, 'clinic.churned', 'clinic_account', p_account_id, jsonb_build_object('note', p_note));
  END IF;
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id;
  RETURN office.account_json(v_account);
END;
$$;

-- Public storefront lead form (apps/web, /local/[office]). The EHR web server
-- calls this with the service role; it is not callable by signed-in users.
CREATE OR REPLACE FUNCTION public.office_capture_lead(p_office_slug TEXT, p_fields JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_office office.offices;
  v_result JSONB;
BEGIN
  IF NOT karibu_is_service_role() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_office FROM office.offices WHERE slug = p_office_slug AND status = 'active';
  IF v_office.id IS NULL THEN RAISE EXCEPTION 'Office not found' USING ERRCODE = 'P0002'; END IF;

  v_result := office.claim_clinic(v_office.id, p_fields - 'claim_disambiguator', 'public_form', NULL);

  IF v_result->>'status' = 'created' THEN
    INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, source, due_at, dedupe_key)
    VALUES (v_office.id, (v_result->>'account_id')::UUID, 'new_lead',
            v_result->>'name', 'system', NOW() + INTERVAL '2 days',
            'new_lead:' || (v_result->>'account_id'))
    ON CONFLICT DO NOTHING;
  END IF;
  -- The public caller learns only that the message was received.
  RETURN jsonb_build_object('received', TRUE);
END;
$$;

-- Public profile for the storefront page. No contact details, no money.
CREATE OR REPLACE FUNCTION public.office_public_profile(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'slug', slug, 'name', name, 'country', country, 'territory', territory,
    'lead', public_profile)
  FROM office.offices WHERE slug = p_slug AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.office_public_slugs()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(slug ORDER BY slug), '[]'::jsonb) FROM office.offices WHERE status = 'active';
$$;

-- ============================================================================
-- 14. RPCs: tasks and field visits
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_task_create(
  p_office_id UUID, p_title TEXT, p_account_id UUID DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL, p_source TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM office.require_member(p_office_id);
  IF COALESCE(trim(p_title), '') = '' THEN RAISE EXCEPTION 'Say what needs doing'; END IF;
  IF p_source NOT IN ('manual', 'ai') THEN RAISE EXCEPTION 'Unknown task source'; END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM office.clinic_accounts WHERE id = p_account_id AND office_id = p_office_id) THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, due_at, source, created_by)
  VALUES (p_office_id, p_account_id, 'todo', trim(p_title), p_due_at, p_source, office.current_sub())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_task_close(p_task_id UUID, p_status TEXT DEFAULT 'done')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_office UUID;
BEGIN
  IF p_status NOT IN ('done', 'dismissed') THEN RAISE EXCEPTION 'Unknown status'; END IF;
  SELECT office_id INTO v_office FROM office.tasks WHERE id = p_task_id;
  IF v_office IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM office.require_member(v_office);
  UPDATE office.tasks SET status = p_status, closed_at = NOW(), closed_by = office.current_sub()
  WHERE id = p_task_id AND status = 'open';
END;
$$;

-- Idempotent on p_id so the phone's offline queue can replay safely.
CREATE OR REPLACE FUNCTION public.office_site_visit_log(
  p_id UUID, p_account_id UUID, p_kind TEXT, p_notes TEXT,
  p_at TIMESTAMPTZ DEFAULT NOW(), p_gps JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_member UUID;
  v_new BOOLEAN;
BEGIN
  v_account := office.require_account(p_account_id);
  v_member := office.require_member(v_account.office_id);

  INSERT INTO office.site_visits (id, office_id, clinic_account_id, member_id, kind, notes, at, gps)
  VALUES (p_id, v_account.office_id, p_account_id, v_member, p_kind, NULLIF(trim(p_notes), ''), p_at, p_gps)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  IF v_new THEN
    UPDATE office.clinic_accounts
    SET last_contact_at = GREATEST(COALESCE(last_contact_at, p_at), p_at), updated_at = NOW()
    WHERE id = p_account_id;
    IF v_account.stage = 'lead' THEN
      PERFORM office.move_stage(p_account_id, 'contacted', 'auto', 'First contact logged');
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_id, 'created', v_new);
END;
$$;

-- ============================================================================
-- 15. RPCs: partner fee
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_fee_ledger(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  PERFORM office.ensure_fee_periods(p_office_id);
  RETURN jsonb_build_object(
    'status', office.fee_status(p_office_id),
    'grace_days', office.setting_int('fee_grace_days', 30),
    'periods', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period', period, 'amount', amount, 'currency', currency, 'status', status,
        'fund', fund, 'reference', reference, 'paid_at', paid_at) ORDER BY period DESC)
      FROM office.partner_fees WHERE office_id = p_office_id), '[]'::jsonb)
  );
END;
$$;

-- Karibu central records a fee payment against its MoMo reference. One
-- transfer can cover several months: the oldest unpaid months are marked first.
CREATE OR REPLACE FUNCTION public.office_admin_fee_mark(
  p_office_id UUID, p_months INTEGER, p_reference TEXT, p_status TEXT DEFAULT 'paid'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.require_central();
  v_office office.offices;
  v_marked INTEGER := 0;
  v_next DATE;
BEGIN
  IF p_status NOT IN ('paid', 'waived') THEN RAISE EXCEPTION 'Unknown status'; END IF;
  IF p_months < 1 OR p_months > 24 THEN RAISE EXCEPTION 'Months must be between 1 and 24'; END IF;
  IF p_status = 'paid' AND COALESCE(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'A payment reference is required';
  END IF;
  SELECT * INTO v_office FROM office.offices WHERE id = p_office_id;
  IF v_office.fee_starts_on IS NULL THEN RAISE EXCEPTION 'Set the fee start date first'; END IF;
  PERFORM office.ensure_fee_periods(p_office_id);

  WHILE v_marked < p_months LOOP
    SELECT MIN(period) INTO v_next FROM office.partner_fees WHERE office_id = p_office_id AND status = 'due';
    IF v_next IS NULL THEN
      -- Paid ahead: open the next month and mark it.
      SELECT (MAX(period) + INTERVAL '1 month')::DATE INTO v_next FROM office.partner_fees WHERE office_id = p_office_id;
      INSERT INTO office.partner_fees (office_id, period, amount, currency, fund)
      VALUES (p_office_id, v_next, v_office.fee_amount, v_office.currency, 'network_fund:' || v_office.country);
    END IF;
    UPDATE office.partner_fees
    SET status = p_status, reference = NULLIF(trim(p_reference), ''), paid_at = NOW(), marked_by = v_sub
    WHERE office_id = p_office_id AND period = v_next;
    v_marked := v_marked + 1;
  END LOOP;

  PERFORM office.audit(p_office_id, 'fee.' || p_status, 'office', p_office_id,
    jsonb_build_object('months', p_months, 'reference', p_reference));
  RETURN jsonb_build_object('marked', v_marked, 'status', office.fee_status(p_office_id));
END;
$$;

-- ============================================================================
-- 16. RPCs: Foundation console (Karibu central)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.office_admin_office_save(p_office_id UUID, p_fields JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.require_central();
  v_office office.offices;
BEGIN
  IF p_office_id IS NULL THEN
    INSERT INTO office.offices (slug, name, country, currency, territory, fee_amount, invoice_prefix, inquiry_email)
    VALUES (
      lower(trim(p_fields->>'slug')), trim(p_fields->>'name'), upper(p_fields->>'country'),
      upper(p_fields->>'currency'), trim(p_fields->>'territory'),
      COALESCE((p_fields->>'fee_amount')::BIGINT, 0),
      COALESCE(NULLIF(upper(trim(p_fields->>'invoice_prefix')), ''), 'KO'),
      NULLIF(trim(p_fields->>'inquiry_email'), ''))
    RETURNING * INTO v_office;
    PERFORM office.audit(v_office.id, 'office.created', 'office', v_office.id);
  ELSE
    UPDATE office.offices SET
      name           = COALESCE(NULLIF(trim(p_fields->>'name'), ''), name),
      territory      = COALESCE(NULLIF(trim(p_fields->>'territory'), ''), territory),
      status         = COALESCE(NULLIF(p_fields->>'status', ''), status),
      stage_override = CASE WHEN p_fields ? 'stage_override' THEN NULLIF(p_fields->>'stage_override', '')::SMALLINT ELSE stage_override END,
      certified_at   = CASE WHEN p_fields ? 'certified' THEN
                         CASE WHEN (p_fields->>'certified')::BOOLEAN THEN COALESCE(certified_at, NOW()) END
                       ELSE certified_at END,
      certified_by   = CASE WHEN p_fields ? 'certified' THEN
                         CASE WHEN (p_fields->>'certified')::BOOLEAN THEN COALESCE(certified_by, v_sub) END
                       ELSE certified_by END,
      fee_amount     = COALESCE((p_fields->>'fee_amount')::BIGINT, fee_amount),
      fee_starts_on  = CASE WHEN p_fields ? 'fee_starts_on' THEN NULLIF(p_fields->>'fee_starts_on', '')::DATE ELSE fee_starts_on END,
      public_profile = CASE WHEN p_fields ? 'public_profile' THEN p_fields->'public_profile' ELSE public_profile END,
      inquiry_email  = CASE WHEN p_fields ? 'inquiry_email' THEN NULLIF(trim(p_fields->>'inquiry_email'), '') ELSE inquiry_email END,
      updated_at = NOW()
    WHERE id = p_office_id
    RETURNING * INTO v_office;
    IF v_office.id IS NULL THEN RAISE EXCEPTION 'Office not found' USING ERRCODE = 'P0002'; END IF;
    PERFORM office.ensure_fee_periods(p_office_id);
    PERFORM office.audit(p_office_id, 'office.updated', 'office', p_office_id, p_fields - 'public_profile');
  END IF;
  RETURN office.office_json(v_office);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_admin_overview()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
  PERFORM office.require_central();
  FOR r IN SELECT id FROM office.offices LOOP
    PERFORM office.ensure_fee_periods(r.id);
  END LOOP;

  RETURN jsonb_build_object(
    'offices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'slug', o.slug, 'name', o.name, 'country', o.country, 'currency', o.currency,
        'territory', o.territory, 'status', o.status, 'certified_at', o.certified_at,
        'fee_status', office.fee_status(o.id), 'fee_amount', o.fee_amount, 'fee_starts_on', o.fee_starts_on,
        'fee_months_due', (SELECT COUNT(*) FROM office.partner_fees f WHERE f.office_id = o.id AND f.status = 'due'),
        'stage', office.derive_stage(o.id),
        'owner', (SELECT jsonb_build_object('name', m.display_name, 'joined', m.clerk_user_id IS NOT NULL)
                  FROM office.office_members m WHERE m.office_id = o.id AND m.role = 'owner' AND m.is_active
                  ORDER BY m.created_at LIMIT 1),
        'clinics', (SELECT COUNT(*) FROM office.clinic_accounts a WHERE a.office_id = o.id AND a.stage <> 'churned'),
        'health', (
          SELECT jsonb_build_object(
            'green', COUNT(*) FILTER (WHERE h.score = 'green'),
            'amber', COUNT(*) FILTER (WHERE h.score = 'amber'),
            'red',   COUNT(*) FILTER (WHERE h.score = 'red'))
          FROM office.clinic_accounts a
          JOIN LATERAL (
            SELECT score FROM office.clinic_health_daily d
            WHERE d.clinic_id = a.clinic_id ORDER BY d.day DESC LIMIT 1) h ON TRUE
          WHERE a.office_id = o.id AND a.stage IN ('live', 'steady', 'billed'))
      ) ORDER BY o.name)
      FROM office.offices o), '[]'::jsonb),
    'conflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'created_at', c.created_at, 'proposed', c.proposed,
        'claiming_office', (SELECT name FROM office.offices WHERE id = c.office_id),
        'holding_office', (SELECT name FROM office.offices WHERE id = c.held_by_office_id),
        'held_stage', (SELECT stage FROM office.clinic_accounts WHERE id = c.held_account_id)
      ) ORDER BY c.created_at)
      FROM office.claim_conflicts c WHERE c.status = 'open'), '[]'::jsonb),
    'fund', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fund', fund, 'currency', currency, 'collected', collected))
      FROM (SELECT fund, currency, SUM(amount) AS collected
            FROM office.partner_fees WHERE status = 'paid' GROUP BY fund, currency) f), '[]'::jsonb),
    'escalated_tickets', (SELECT COUNT(*) FROM office.support_tickets
                          WHERE escalated_to_karibu AND status IN ('open', 'in_progress'))
  );
END;
$$;

-- allow = the two are different facilities; the claiming office gets its own
-- account. deny = same facility; the first claim stands.
CREATE OR REPLACE FUNCTION public.office_admin_conflict_resolve(p_conflict_id UUID, p_decision TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.require_central();
  v_conflict office.claim_conflicts;
  v_result JSONB := NULL;
BEGIN
  IF p_decision NOT IN ('allow', 'deny') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  SELECT * INTO v_conflict FROM office.claim_conflicts WHERE id = p_conflict_id AND status = 'open' FOR UPDATE;
  IF v_conflict.id IS NULL THEN RAISE EXCEPTION 'Conflict not found or already resolved' USING ERRCODE = 'P0002'; END IF;

  IF p_decision = 'allow' THEN
    INSERT INTO office.clinic_accounts (
      office_id, country, name, district, facility_level, contact_name, contact_phone, source, created_by, claim_disambiguator)
    SELECT v_conflict.office_id, o.country, trim(v_conflict.proposed->>'name'),
           NULLIF(trim(v_conflict.proposed->>'district'), ''),
           NULLIF(trim(v_conflict.proposed->>'facility_level'), ''),
           NULLIF(trim(v_conflict.proposed->>'contact_name'), ''),
           NULLIF(trim(v_conflict.proposed->>'contact_phone'), ''),
           COALESCE(NULLIF(v_conflict.proposed->>'source', ''), 'manual'),
           v_conflict.created_by, v_conflict.id::TEXT
    FROM office.offices o WHERE o.id = v_conflict.office_id
    RETURNING jsonb_build_object('account_id', id) INTO v_result;
  END IF;

  UPDATE office.claim_conflicts
  SET status = CASE p_decision WHEN 'allow' THEN 'allowed' ELSE 'denied' END,
      resolved_by = v_sub, resolved_at = NOW(), resolution_note = p_note
  WHERE id = p_conflict_id;

  -- Tell the claiming office what was decided.
  INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, detail, source)
  VALUES (v_conflict.office_id, (v_result->>'account_id')::UUID, 'claim_' || p_decision,
          v_conflict.proposed->>'name', jsonb_build_object('note', p_note), 'system');

  PERFORM office.audit(v_conflict.office_id, 'clinic.claim_' || p_decision, 'claim_conflict', p_conflict_id, jsonb_build_object('note', p_note));
  RETURN jsonb_build_object('decision', p_decision) || COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- A clinic changes partner, or its partner exits. Clinic data stays with the
-- clinic; only the office relationship moves.
CREATE OR REPLACE FUNCTION public.office_admin_clinic_transfer(p_account_id UUID, p_to_office_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_to office.offices;
BEGIN
  PERFORM office.require_central();
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO v_account FROM office.clinic_accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_to FROM office.offices WHERE id = p_to_office_id AND status = 'active';
  IF v_account.id IS NULL OR v_to.id IS NULL THEN RAISE EXCEPTION 'Clinic or office not found' USING ERRCODE = 'P0002'; END IF;
  IF v_to.country <> v_account.country THEN RAISE EXCEPTION 'Offices are in different countries'; END IF;
  IF v_to.id = v_account.office_id THEN RAISE EXCEPTION 'The clinic already belongs to that office'; END IF;

  UPDATE office.clinic_accounts
  SET office_id = p_to_office_id, assigned_member_id = NULL, updated_at = NOW()
  WHERE id = p_account_id;
  -- Open work follows the clinic. Invoices and payments stay with the office that issued them.
  UPDATE office.tasks SET office_id = p_to_office_id WHERE clinic_account_id = p_account_id AND status = 'open';
  UPDATE office.support_tickets SET office_id = p_to_office_id
  WHERE clinic_account_id = p_account_id AND status IN ('open', 'in_progress');

  PERFORM office.audit(v_account.office_id, 'clinic.transferred_out', 'clinic_account', p_account_id,
    jsonb_build_object('to_office', p_to_office_id, 'reason', p_reason));
  PERFORM office.audit(p_to_office_id, 'clinic.transferred_in', 'clinic_account', p_account_id,
    jsonb_build_object('from_office', v_account.office_id, 'reason', p_reason));
  RETURN jsonb_build_object('account_id', p_account_id, 'office_id', p_to_office_id);
END;
$$;

-- ============================================================================
-- 17. Grants
-- ============================================================================
-- Functions are executable by PUBLIC when created, and a per-schema
-- ALTER DEFAULT PRIVILEGES cannot take that away. So every office migration
-- ends by calling this: it closes every public.office_* function to PUBLIC and
-- anon, opens it to signed-in users and the service role, then applies the
-- two exception lists.

CREATE OR REPLACE FUNCTION office.apply_rpc_grants(p_anon TEXT[], p_service_only TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SET search_path = office, public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'office\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (p_service_only) THEN
      CONTINUE;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    IF r.proname = ANY (p_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;

  -- Helpers in the office schema are internal. The schema has no USAGE grant,
  -- and this removes the function-level default as well.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'office'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END;
$$;

SELECT office.apply_rpc_grants(
  p_anon         => ARRAY['office_public_profile', 'office_public_slugs'],
  p_service_only => ARRAY['office_capture_lead']
);

-- ============================================================================
-- 18. Seed: Karibu Uganda (from packages/shared/src/pricing.ts LOCAL_OFFICES)
-- ============================================================================
-- Active so the public storefront keeps working. fee_starts_on is NULL, so no
-- fee is owed until Karibu central sets the start date in the Foundation
-- console. No owner row: central sends the join link.

INSERT INTO office.offices (slug, name, country, currency, territory, fee_amount, invoice_prefix, status, inquiry_email, public_profile)
VALUES (
  'uganda', 'Karibu Uganda', 'UG', 'UGX', 'Uganda', 20000, 'KU', 'active', 'nate@cappawork.com',
  jsonb_build_object(
    'name', 'Javis Bbombokka',
    'firstName', 'Javis',
    'title', 'Lead, Karibu Uganda',
    'photo', '/headshots/javis.png',
    'bio', 'Javis is a nurse and co-designer of Karibu. Every screen clinicians use today was shaped by Javis’s time on Ugandan clinic floors, and every Karibu Uganda clinic is set up, trained and supported by Javis directly.'
  )
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO office.territories (office_id, country, districts)
SELECT id, 'UG', '{}' FROM office.offices o
WHERE slug = 'uganda' AND NOT EXISTS (SELECT 1 FROM office.territories t WHERE t.office_id = o.id);
