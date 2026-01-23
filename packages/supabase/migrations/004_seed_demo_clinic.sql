-- Seed data for demo clinic
-- This creates a single clinic for the demo MVP

-- Insert demo clinic
INSERT INTO clinics (id, name, slug, whatsapp_phone_number, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Karibu Demo Clinic',
  'karibu-demo',
  NULL, -- Will be configured with actual WhatsApp number
  'Africa/Kampala'
);

-- Note: Staff will be created when the doctor first logs in via Clerk
-- The app will check if a staff record exists for the Clerk user ID,
-- and create one if not (linked to the demo clinic)
