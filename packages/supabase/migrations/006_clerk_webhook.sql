-- Migration: Clerk Organization Integration for Multi-Clinic Support
-- Each Clerk Organization = 1 Clinic. Staff join via invite link.

-- Add clerk_organization_id to clinics for Clerk Organization mapping
ALTER TABLE clinics ADD COLUMN clerk_organization_id TEXT UNIQUE;

-- Create index for quick clinic lookup by organization
CREATE INDEX idx_clinics_clerk_org ON clinics(clerk_organization_id);

-- Add deactivated_at for soft-delete when staff leave organization
ALTER TABLE staff ADD COLUMN deactivated_at TIMESTAMPTZ;

-- Function to get clinic_id from clerk organization
CREATE OR REPLACE FUNCTION get_clinic_by_clerk_org(org_id TEXT)
RETURNS UUID AS $$
  SELECT id FROM clinics WHERE clerk_organization_id = org_id AND is_active = TRUE LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Update the get_current_clinic_id function to use organization claims
-- This allows RLS policies to work with Clerk Organizations
CREATE OR REPLACE FUNCTION get_current_clinic_id()
RETURNS UUID AS $$
DECLARE
  clerk_org_id TEXT;
  clinic_uuid UUID;
BEGIN
  -- First try to get organization from JWT claims
  clerk_org_id := auth.jwt()->>'org_id';

  IF clerk_org_id IS NOT NULL THEN
    SELECT id INTO clinic_uuid
    FROM clinics
    WHERE clerk_organization_id = clerk_org_id AND is_active = TRUE;

    IF clinic_uuid IS NOT NULL THEN
      RETURN clinic_uuid;
    END IF;
  END IF;

  -- Fallback: Get clinic from staff record using user_id
  SELECT s.clinic_id INTO clinic_uuid
  FROM staff s
  WHERE s.clerk_user_id = auth.jwt()->>'sub'
    AND s.is_active = TRUE
    AND s.deactivated_at IS NULL
  LIMIT 1;

  RETURN clinic_uuid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Update get_current_staff_id to exclude deactivated staff
CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID AS $$
  SELECT id FROM staff
  WHERE clerk_user_id = auth.jwt()->>'sub'
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Comment explaining the Clerk Organization workflow:
-- 1. Admin creates clinic in Supabase with clerk_organization_id
-- 2. Staff joins Clerk Organization via invite link
-- 3. Clerk webhook fires organizationMembership.created
-- 4. Webhook handler creates/activates staff record linked to clinic
-- 5. When staff leaves org, organizationMembership.deleted fires
-- 6. Webhook handler sets deactivated_at on staff record
