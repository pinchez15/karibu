-- Migration 025: Superadmin provisioning surfaces
--
-- Adds the backend schema needed for a first-party provisioning UI that owns
-- clinic setup and staff onboarding without requiring humans to touch the
-- Clerk dashboard directly.

-- ============================================================================
-- 1. Platform-level superadmins
-- ============================================================================

CREATE TABLE IF NOT EXISTS superadmins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_superadmins_clerk_user_id ON superadmins(clerk_user_id);

DROP TRIGGER IF EXISTS update_superadmins_updated_at ON superadmins;
CREATE TRIGGER update_superadmins_updated_at
  BEFORE UPDATE ON superadmins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmins_select_self" ON superadmins;
CREATE POLICY "superadmins_select_self" ON superadmins
  FOR SELECT
  USING (clerk_user_id = auth.jwt()->>'sub');

-- ============================================================================
-- 2. Richer clinic metadata for provisioning and print configuration
-- ============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS diocese TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subcounty TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS parish TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS level TEXT;

-- ============================================================================
-- 3. Clinic departments
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN (
    'opd',
    'anc',
    'maternity',
    'family_planning',
    'immunization'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, department)
);

CREATE INDEX IF NOT EXISTS idx_clinic_departments_clinic_id ON clinic_departments(clinic_id);

ALTER TABLE clinic_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_departments_read_same_clinic" ON clinic_departments;
CREATE POLICY "clinic_departments_read_same_clinic" ON clinic_departments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM staff
      WHERE staff.clinic_id = clinic_departments.clinic_id
        AND staff.clerk_user_id = auth.jwt()->>'sub'
        AND staff.is_active = TRUE
        AND staff.deactivated_at IS NULL
    )
  );

-- ============================================================================
-- 4. Staff invitation tracking
-- ============================================================================
--
-- This lets the app persist the desired Karibu role before the invited person
-- accepts the Clerk organization invite. The webhook can then materialize the
-- correct `staff.role` instead of collapsing everything to org:member.

CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  clerk_organization_id TEXT NOT NULL,
  clerk_invitation_id TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'admin',
    'doctor',
    'nurse',
    'clinical_officer',
    'midwife',
    'nursing_assistant',
    'records_officer',
    'lab_tech',
    'dispenser'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  invited_by_clerk_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (clinic_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_clinic_id ON staff_invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON staff_invitations(email);

DROP TRIGGER IF EXISTS update_staff_invitations_updated_at ON staff_invitations;
CREATE TRIGGER update_staff_invitations_updated_at
  BEFORE UPDATE ON staff_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_invitations_read_same_clinic" ON staff_invitations;
CREATE POLICY "staff_invitations_read_same_clinic" ON staff_invitations
  FOR SELECT
  USING (
    clinic_id = get_current_clinic_id()
    AND (is_admin() OR get_current_staff_role() IN ('doctor', 'clinical_officer', 'midwife'))
  );
