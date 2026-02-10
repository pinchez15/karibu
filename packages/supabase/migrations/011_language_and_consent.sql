-- Migration 011: Language support, consent system, and transcript storage
-- Supports dual transcription providers (OpenAI for English, Sunbird AI for local languages)
-- Implements Uganda DPPA-compliant consent tracking

-- =============================================
-- VISITS TABLE: Add language and transcript fields
-- =============================================

-- Source language: simple toggle between English and local language
ALTER TABLE visits ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'eng'
  CHECK (source_language IN ('eng', 'local'));

-- Consent tracking (links to patient_consents table)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS consent_id UUID;

-- Review status for clinician review of AI-generated content
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'pending_review', 'reviewed', 'rejected'));
ALTER TABLE visits ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Audio retention tracking
ALTER TABLE visits ADD COLUMN IF NOT EXISTS audio_deleted_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- =============================================
-- PROVIDER NOTES: Add dual transcript storage
-- =============================================

-- Original transcript (in source language)
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcript_original TEXT;

-- English transcript (same as transcript if source=eng, translated if source=local)
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcript_english TEXT;

-- Transcription metadata
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcription_provider TEXT
  CHECK (transcription_provider IN ('openai', 'sunbird'));
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcription_confidence NUMERIC;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS diarization_output JSONB;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS audio_trimmed BOOLEAN DEFAULT FALSE;

-- =============================================
-- PATIENT CONSENTS TABLE (Uganda DPPA compliance)
-- =============================================

CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'audio_recording',
    'ai_processing',
    'data_storage',
    'cross_border_transfer',
    'minor_guardian'
  )),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT NOT NULL CHECK (granted_by IN (
    'patient',
    'guardian',
    'clinician_witnessed'
  )),
  guardian_name TEXT,
  guardian_relationship TEXT,
  withdrawal_at TIMESTAMPTZ,
  consent_method TEXT NOT NULL CHECK (consent_method IN (
    'verbal_recorded',
    'written_paper',
    'digital_whatsapp',
    'digital_app'
  )),
  consent_language TEXT NOT NULL DEFAULT 'eng',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_visit ON patient_consents(visit_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type ON patient_consents(patient_id, consent_type)
  WHERE withdrawal_at IS NULL;

-- Add foreign key from visits to patient_consents
ALTER TABLE visits ADD CONSTRAINT fk_visits_consent
  FOREIGN KEY (consent_id) REFERENCES patient_consents(id);

-- =============================================
-- MAGIC LINKS: Update default expiry to 48 hours
-- =============================================

-- No ALTER for default on existing column, but the application layer will use 48hr expiry.
-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_magic_links_patient ON magic_links(patient_id);

-- =============================================
-- AUDIT LOGS: Enhance for DPPA compliance
-- =============================================

-- Add patient_id for fast patient-specific queries (denormalized)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS patient_id UUID;

-- Add actor_clerk_id for Clerk user tracking (TEXT, since Clerk IDs are strings)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_clerk_id TEXT;

-- Add actor_role for quick filtering
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;

-- Additional indexes for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient ON audit_logs(patient_id)
  WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_clerk ON audit_logs(actor_clerk_id)
  WHERE actor_clerk_id IS NOT NULL;

-- =============================================
-- RLS for patient_consents
-- =============================================

ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

-- All clinic staff can view consents for their clinic's patients
CREATE POLICY "consents_select_policy" ON patient_consents
  FOR SELECT
  USING (
    patient_id IN (
      SELECT id FROM patients WHERE clinic_id = get_current_clinic_id()
    )
  );

-- All clinic staff can create consents (nurses do intake, doctors do recording consent)
CREATE POLICY "consents_insert_policy" ON patient_consents
  FOR INSERT
  WITH CHECK (
    patient_id IN (
      SELECT id FROM patients WHERE clinic_id = get_current_clinic_id()
    )
  );

-- Only admins can update consents (for withdrawal processing)
CREATE POLICY "consents_update_policy" ON patient_consents
  FOR UPDATE
  USING (
    is_admin() AND
    patient_id IN (
      SELECT id FROM patients WHERE clinic_id = get_current_clinic_id()
    )
  );

-- =============================================
-- Helper function: Check if patient has valid consent for visit
-- =============================================

CREATE OR REPLACE FUNCTION check_patient_consent(
  p_patient_id UUID,
  p_visit_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_consent BOOLEAN;
BEGIN
  -- Check that all required consent types are granted and not withdrawn
  SELECT bool_and(granted) INTO v_has_consent
  FROM patient_consents
  WHERE patient_id = p_patient_id
    AND visit_id = p_visit_id
    AND consent_type IN ('audio_recording', 'ai_processing', 'data_storage', 'cross_border_transfer')
    AND withdrawal_at IS NULL;

  -- Must have all 4 consent types
  IF v_has_consent IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_has_consent;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_patient_consent(UUID, UUID) TO anon, authenticated;
