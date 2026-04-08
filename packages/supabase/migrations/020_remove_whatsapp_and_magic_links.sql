-- =============================================
-- Remove WhatsApp delivery + magic links
-- =============================================
-- Date: 2026-04-08
-- Reason: Patient note delivery is shifting to physical printout from the
-- staff dashboard. WhatsApp send-out and magic-link patient viewer are
-- removed entirely. This eliminates the patient enumeration / cost
-- amplification surface that the public /api/patient/request-link route
-- and the magic_links table created.
--
-- Notes:
-- - message_logs is RETAINED for historical record (audit + compliance).
-- - patient_consents.cross_border_transfer is RETAINED — audio still ships
--   to OpenAI / Sunbird AI for transcription, so DPPA cross-border consent
--   is still required for that pipeline.
-- - patients.whatsapp_number is RETAINED — it is still the primary patient
--   contact field, used for identification and check-in lookup.

-- Drop the policy that depends on magic_links before dropping the table
DROP POLICY IF EXISTS "Staff can manage clinic magic links" ON magic_links;

-- Drop indexes (will be dropped by table drop, but explicit for clarity)
DROP INDEX IF EXISTS idx_magic_links_token;
DROP INDEX IF EXISTS idx_magic_links_expires;
DROP INDEX IF EXISTS idx_magic_links_patient;

-- Drop the table
DROP TABLE IF EXISTS magic_links;

-- Remove WhatsApp Business API config from clinics (clinic-level send config)
ALTER TABLE clinics DROP COLUMN IF EXISTS whatsapp_phone_number;
ALTER TABLE clinics DROP COLUMN IF EXISTS whatsapp_business_account_id;
