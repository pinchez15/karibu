-- Support clinic-scoped patient directory browse/sort at ~10k rows per clinic.

CREATE INDEX IF NOT EXISTS idx_patients_clinic_name_sort
  ON patients (clinic_id, last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_location_sort
  ON patients (clinic_id, village, parish)
  WHERE village IS NOT NULL OR parish IS NOT NULL;
