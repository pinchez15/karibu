-- 081_lab_stock_unit_price.sql
-- Lab / clinical supply stock: per-unit sale price (UGX), matching pharmacy_stock_items.

BEGIN;

ALTER TABLE lab_stock_items
  ADD COLUMN IF NOT EXISTS unit_price_ugx INTEGER;

COMMENT ON COLUMN lab_stock_items.unit_price_ugx IS
  'Sale price per unit in UGX; null when subsidised or unknown.';

COMMIT;
