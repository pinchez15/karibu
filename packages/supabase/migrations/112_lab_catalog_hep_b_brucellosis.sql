-- 112_lab_catalog_hep_b_brucellosis.sql
--
-- Add Hepatitis B (HBsAg) and Brucellosis RDT to the national lab catalog and
-- align clinic capability names with the canonical catalog display names used
-- by web/Android order pickers and the lab bench.

INSERT INTO lab_test_catalog (code, test_name, category, specimen, display_order, default_price_ugx)
VALUES
  ('HBSAG',   'Hepatitis B rapid test (HBsAg)', 'serology', 'blood', 24, 2500),
  ('BRU_RDT', 'Brucellosis rapid test',         'serology', 'blood', 25, 2500)
ON CONFLICT (code) DO UPDATE SET
  test_name         = EXCLUDED.test_name,
  category          = EXCLUDED.category,
  specimen          = EXCLUDED.specimen,
  display_order     = EXCLUDED.display_order,
  default_price_ugx = EXCLUDED.default_price_ugx,
  active            = TRUE;

-- Rename legacy capability label so dictation picker and chart catalog agree.
UPDATE clinic_lab_capabilities
SET test_name = 'Hepatitis B rapid test (HBsAg)'
WHERE test_name = 'Hepatitis B test';

INSERT INTO clinic_lab_capabilities (clinic_id, test_name, is_available)
SELECT c.id, lab.test_name, TRUE
FROM clinics c
CROSS JOIN (VALUES
  ('Hepatitis B rapid test (HBsAg)'),
  ('Brucellosis rapid test')
) AS lab(test_name)
ON CONFLICT (clinic_id, test_name) DO NOTHING;
