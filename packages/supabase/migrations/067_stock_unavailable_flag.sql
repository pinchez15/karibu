-- 067_stock_unavailable_flag.sql
--
-- S-STOCK (#14) — an explicit "unavailable" supply flag, distinct from
-- quantity_on_hand. "Out of stock" in the field often means "we had this but
-- can't get it right now" even when a few units linger, so it's a supply
-- decision, not a count. Drives the out-of-stock list on the Stock page and
-- the out-of-stock alert on the Today board.

ALTER TABLE pharmacy_stock_items
  ADD COLUMN IF NOT EXISTS is_unavailable BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pharmacy_stock_items.is_unavailable IS
  'Staff-set: drug is currently unobtainable regardless of on-hand count. Out-of-stock = is_unavailable OR quantity_on_hand <= 0.';

-- Lab stock gets the same flag for symmetry (the lab desk has the same problem).
ALTER TABLE lab_stock_items
  ADD COLUMN IF NOT EXISTS is_unavailable BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lab_stock_items.is_unavailable IS
  'Staff-set: test/reagent currently unobtainable regardless of on-hand count.';
