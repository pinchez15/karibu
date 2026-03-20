-- Payments Phase 1: Cash receipt logging
-- Every visit gets a digital payment record. Replaces handwritten receipt books.

-- =============================================
-- CLINIC RECEIPT PREFIX
-- =============================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS receipt_prefix VARCHAR(5);

-- Backfill existing clinics with uppercased first 3 chars of slug
UPDATE clinics SET receipt_prefix = UPPER(LEFT(slug, 3)) WHERE receipt_prefix IS NULL;

-- =============================================
-- RECEIPT SEQUENCE TRACKING
-- =============================================

CREATE TABLE IF NOT EXISTS payment_receipt_sequences (
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  sequence_date DATE NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, sequence_date)
);

-- =============================================
-- PAYMENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  amount_ugx INTEGER NOT NULL CHECK (amount_ugx >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money')),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed', 'waived')),
  receipt_number TEXT UNIQUE,
  service_type TEXT,
  notes TEXT,
  collected_by UUID REFERENCES staff(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_visit ON payments(visit_id);
CREATE INDEX IF NOT EXISTS idx_payments_clinic_date ON payments(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receipt_number);

-- Updated_at trigger (reuse existing function from initial schema)
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RECEIPT NUMBER GENERATION (BEFORE INSERT TRIGGER)
-- =============================================

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_date TEXT;
  v_seq INTEGER;
BEGIN
  -- Get clinic receipt prefix
  SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
  INTO v_prefix
  FROM clinics
  WHERE id = NEW.clinic_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'KH';
  END IF;

  -- Format date as YYYYMMDD
  v_date := TO_CHAR(NOW() AT TIME ZONE 'Africa/Kampala', 'YYYYMMDD');

  -- Acquire advisory lock scoped to this clinic + date to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id::text || v_date));

  -- Upsert sequence counter
  INSERT INTO payment_receipt_sequences (clinic_id, sequence_date, last_sequence)
  VALUES (NEW.clinic_id, CURRENT_DATE, 1)
  ON CONFLICT (clinic_id, sequence_date)
  DO UPDATE SET last_sequence = payment_receipt_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;

  -- Format receipt number: KH-KDC-20260330-0042
  NEW.receipt_number := 'KH-' || v_prefix || '-' || v_date || '-' || LPAD(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER generate_payment_receipt
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION generate_receipt_number();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- All clinic staff can view payments for their clinic
CREATE POLICY "payments_select_policy" ON payments
  FOR SELECT
  USING (clinic_id = get_current_clinic_id());

-- All clinic staff can record payments
CREATE POLICY "payments_insert_policy" ON payments
  FOR INSERT
  WITH CHECK (clinic_id = get_current_clinic_id());

-- Only admins can update payments (corrections)
CREATE POLICY "payments_update_policy" ON payments
  FOR UPDATE
  USING (clinic_id = get_current_clinic_id() AND is_admin());

-- Grant access to service role (for server actions)
GRANT ALL ON payments TO service_role;
GRANT ALL ON payment_receipt_sequences TO service_role;
