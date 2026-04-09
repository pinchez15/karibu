-- =============================================
-- Clinic letterhead fields for printed patient notes
-- =============================================
-- Date: 2026-04-09
-- Reason: Patient notes are now printed on 58mm thermal receipts and handed
-- to patients. Real Ugandan clinic discharge documents need clinic phone
-- (so patients can call when symptoms worsen) and the doctor's UMDPC
-- registration number (so the document is recognized as official by other
-- clinics, pharmacies, and employers).

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS umdpc_number TEXT;

COMMENT ON COLUMN clinics.phone IS 'Clinic contact phone for patient follow-up. Printed on thermal receipts.';
COMMENT ON COLUMN clinics.umdpc_number IS 'Uganda Medical and Dental Practitioners Council registration number. Printed on thermal receipts to establish official status.';
