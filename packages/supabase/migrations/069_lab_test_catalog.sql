-- 069_lab_test_catalog.sql
--
-- F2 (#7c/#13b/#15c) — deterministic lab ordering. Labs were free text
-- (visits.tests_ordered), which is why mis-spelled / ambiguous tests reach the
-- bench. This mirrors medication_catalog (064): a catalog the order picker and
-- the AI "pre-select what you dictated" step both resolve against, so what is
-- SENT to the lab is always a catalog code, never free text.

CREATE TABLE IF NOT EXISTS lab_test_catalog (
  code          TEXT PRIMARY KEY,
  test_name     TEXT NOT NULL,
  category      TEXT,           -- malaria | hematology | serology | microbiology | biochemistry | urine
  specimen      TEXT,           -- blood | urine | stool | sputum | swab
  result_unit   TEXT,           -- for quantitative results, optional
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common Uganda HC III bench tests.
INSERT INTO lab_test_catalog (code, test_name, category, specimen, display_order) VALUES
  ('MRDT',       'Malaria RDT',                       'malaria',       'blood',  10),
  ('BS_MPS',     'Blood slide for malaria parasites', 'malaria',       'blood',  11),
  ('HIV_RDT',    'HIV rapid test',                    'serology',      'blood',  20),
  ('HB',         'Haemoglobin',                       'hematology',    'blood',  30),
  ('AFB',        'Sputum smear (AFB / TB)',           'microbiology',  'sputum', 40),
  ('URINALYSIS', 'Urinalysis',                        'urine',         'urine',  50),
  ('STOOL_OC',   'Stool microscopy (ova/cysts)',      'microbiology',  'stool',  60),
  ('RBS',        'Random blood sugar',                'biochemistry',  'blood',  70),
  ('SYPHILIS',   'Syphilis test (RPR/TPHA)',          'serology',      'blood',  80),
  ('UCG',        'Pregnancy test (UCG)',              'serology',      'urine',  90),
  ('WIDAL',      'Widal test (typhoid)',              'serology',      'blood', 100),
  ('STOOL_RDT',  'Stool antigen / H. pylori RDT',     'microbiology',  'stool', 110)
ON CONFLICT (code) DO NOTHING;

-- Reference data, no PHI — readable by any signed-in staff member.
ALTER TABLE lab_test_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_test_catalog_select ON lab_test_catalog;
CREATE POLICY lab_test_catalog_select ON lab_test_catalog
  FOR SELECT TO authenticated USING (TRUE);
GRANT SELECT ON lab_test_catalog TO authenticated, service_role;
