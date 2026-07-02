-- Per-clinic thermal printer layout (58mm / 80mm rolls, cut feed tuning).
-- Karibu prints visit summaries, billing receipts, and pharmacy slips via
-- browser print → thermal driver. These settings tune CSS width and paper feed.

CREATE TABLE IF NOT EXISTS clinic_print_settings (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  paper_width_mm SMALLINT NOT NULL DEFAULT 58 CHECK (paper_width_mm IN (58, 80)),
  cut_feed_mm SMALLINT NOT NULL DEFAULT 14 CHECK (cut_feed_mm BETWEEN 8 AND 24),
  auto_print BOOLEAN NOT NULL DEFAULT true,
  setup_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clinic_print_settings IS
  'Thermal receipt layout per clinic. Visit, billing, and pharmacy print routes read these values.';
COMMENT ON COLUMN clinic_print_settings.paper_width_mm IS 'Thermal roll width: 58mm (32 cols) or 80mm (48 cols).';
COMMENT ON COLUMN clinic_print_settings.cut_feed_mm IS 'Blank feed before auto-cut (mm). Increase if cutter lands through footer text.';
COMMENT ON COLUMN clinic_print_settings.auto_print IS 'When true, receipt pages open the browser print dialog automatically.';
COMMENT ON COLUMN clinic_print_settings.setup_completed_at IS 'Set when admin finishes printer setup wizard.';

ALTER TABLE clinic_print_settings ENABLE ROW LEVEL SECURITY;

-- Server (service role) only — same pattern as clinic_billing_rates.
CREATE POLICY "service role full access clinic_print_settings"
  ON clinic_print_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
