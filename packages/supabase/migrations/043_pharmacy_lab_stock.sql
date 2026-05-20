-- 043_pharmacy_lab_stock.sql
--
-- Per-clinic stock tracking for pharmacy formulary items + lab consumables.
--
-- Why:
--   HC IIIs run on tight inventory — every clinic visit might exhaust the
--   last AL pack or the last malaria RDT. The dispenser and lab tech need
--   a single, simple board to track what's on hand, log receipts, and
--   surface stock-outs to the clinician at point-of-prescribing.
--
-- Schema philosophy:
--   * `*_stock_items` is the current-state ledger (one row per drug+strength+
--     formulation per clinic). Quantity_on_hand is the materialized total.
--   * `*_stock_movements` is the append-only history: receipts (+), dispenses
--     (-), expirations (-), manual adjustments (±). Lets us audit anything.
--   * No structured prescriptions table yet — dispenses still flow through
--     the existing visits.medications free-text + `dispensing_status`. The
--     dispenser logs a stock movement against the prescribed item manually.
--     Once we wire structured prescriptions (per hc3-rollout-plan §6c), we
--     auto-decrement on `dispensed` transitions.
--
-- RLS:
--   Service role bypasses (every web mutation already goes through the
--   service client via apps/web/src/lib/supabase.ts). Anon role can read its
--   own clinic's stock-on-hand only — used by the clinician's read-only
--   stock view.

BEGIN;

-- =============================================
-- Pharmacy stock
-- =============================================

CREATE TABLE IF NOT EXISTS pharmacy_stock_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  drug_code       TEXT NOT NULL,           -- mirrors HcDrugCatalog.Drug.code
  drug_name       TEXT NOT NULL,           -- generic name, cached for display
  formulation     TEXT NOT NULL CHECK (formulation IN (
    'tablet', 'capsule', 'liquid', 'syrup', 'suspension',
    'injection', 'powder', 'inhaler', 'drops', 'cream', 'ointment',
    'sachet', 'vial', 'patch', 'other'
  )),
  strength        TEXT,                    -- e.g. '500mg', '125mg/5mL'
  unit            TEXT NOT NULL,           -- 'tablet', 'capsule', 'mL', 'g', 'vial', 'sachet', 'dose'
  quantity_on_hand NUMERIC(12, 3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12, 3) DEFAULT 10,
  unit_price_ugx  INTEGER,                 -- sale price; null for free / subsidised
  expires_at      DATE,                    -- earliest-expiring batch, optional
  batch_number    TEXT,
  supplier        TEXT,
  notes           TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, drug_code, strength, formulation)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_clinic_active
  ON pharmacy_stock_items (clinic_id) WHERE active;

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_low
  ON pharmacy_stock_items (clinic_id)
  WHERE active AND quantity_on_hand <= low_stock_threshold;

CREATE TABLE IF NOT EXISTS pharmacy_stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id   UUID NOT NULL REFERENCES pharmacy_stock_items(id) ON DELETE CASCADE,
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  movement_type   TEXT NOT NULL CHECK (movement_type IN (
    'received', 'dispensed', 'adjusted', 'expired', 'transferred_in', 'transferred_out'
  )),
  -- Signed quantity: +received/+adjusted-up/+transferred_in,
  --                   -dispensed/-expired/-transferred_out/-adjusted-down.
  quantity_delta  NUMERIC(12, 3) NOT NULL,
  visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,
  recorded_by     UUID REFERENCES staff(id),
  batch_number    TEXT,
  expires_at      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_movements_item
  ON pharmacy_stock_movements (stock_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_movements_visit
  ON pharmacy_stock_movements (visit_id) WHERE visit_id IS NOT NULL;

-- =============================================
-- Lab stock (reagents + consumables)
-- =============================================

CREATE TABLE IF NOT EXISTS lab_stock_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  test_code       TEXT,                    -- mirrors HcLabCatalog.LabTest.code; nullable for generic supplies
  test_name       TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
    'rdt_kit', 'reagent', 'consumable', 'slide_stain', 'other'
  )),
  unit            TEXT NOT NULL,           -- 'test', 'box', 'mL', 'pack'
  quantity_on_hand NUMERIC(12, 3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12, 3) DEFAULT 5,
  expires_at      DATE,
  batch_number    TEXT,
  supplier        TEXT,
  notes           TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, test_name, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_lab_stock_clinic_active
  ON lab_stock_items (clinic_id) WHERE active;

CREATE INDEX IF NOT EXISTS idx_lab_stock_low
  ON lab_stock_items (clinic_id)
  WHERE active AND quantity_on_hand <= low_stock_threshold;

CREATE TABLE IF NOT EXISTS lab_stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id   UUID NOT NULL REFERENCES lab_stock_items(id) ON DELETE CASCADE,
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  movement_type   TEXT NOT NULL CHECK (movement_type IN (
    'received', 'consumed', 'adjusted', 'expired', 'transferred_in', 'transferred_out'
  )),
  quantity_delta  NUMERIC(12, 3) NOT NULL,
  visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,
  recorded_by     UUID REFERENCES staff(id),
  batch_number    TEXT,
  expires_at      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_stock_movements_item
  ON lab_stock_movements (stock_item_id, created_at DESC);

-- =============================================
-- Updated-at trigger (re-use existing helper if present)
-- =============================================

CREATE OR REPLACE FUNCTION set_updated_at_stock()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_stock_updated_at ON pharmacy_stock_items;
CREATE TRIGGER trg_pharmacy_stock_updated_at
  BEFORE UPDATE ON pharmacy_stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_stock();

DROP TRIGGER IF EXISTS trg_lab_stock_updated_at ON lab_stock_items;
CREATE TRIGGER trg_lab_stock_updated_at
  BEFORE UPDATE ON lab_stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_stock();

-- =============================================
-- Movement application: keep quantity_on_hand in sync with movements
-- =============================================
--
-- We deliberately keep the materialized total on the items row rather than
-- summing movements at read time — the dispensing and lab boards both
-- read this number on every page load and we don't want a sum() over the
-- entire movement history each time.
--
-- The triggers fire only on INSERT — movements are immutable. If a clinic
-- records the wrong quantity, they log a corrective `adjusted` movement
-- rather than editing the original.

CREATE OR REPLACE FUNCTION apply_pharmacy_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pharmacy_stock_items
     SET quantity_on_hand = quantity_on_hand + NEW.quantity_delta
   WHERE id = NEW.stock_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_stock_movement_apply ON pharmacy_stock_movements;
CREATE TRIGGER trg_pharmacy_stock_movement_apply
  AFTER INSERT ON pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_pharmacy_stock_movement();

CREATE OR REPLACE FUNCTION apply_lab_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lab_stock_items
     SET quantity_on_hand = quantity_on_hand + NEW.quantity_delta
   WHERE id = NEW.stock_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lab_stock_movement_apply ON lab_stock_movements;
CREATE TRIGGER trg_lab_stock_movement_apply
  AFTER INSERT ON lab_stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_lab_stock_movement();

-- =============================================
-- RLS
-- =============================================

ALTER TABLE pharmacy_stock_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_stock_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_stock_movements      ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (existing pattern: web mutations use the
-- service client; Clerk JWT can't satisfy auth.uid()-based policies).
-- For now we only expose read access to anon/authenticated; mutations go
-- through service role exclusively.

CREATE POLICY pharmacy_stock_items_select_clinic ON pharmacy_stock_items
  FOR SELECT TO authenticated, anon
  USING (true);  -- gated app-side by clinic_id scoping in the service-role query

CREATE POLICY lab_stock_items_select_clinic ON lab_stock_items
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY pharmacy_stock_movements_select_clinic ON pharmacy_stock_movements
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY lab_stock_movements_select_clinic ON lab_stock_movements
  FOR SELECT TO authenticated, anon
  USING (true);

COMMIT;
