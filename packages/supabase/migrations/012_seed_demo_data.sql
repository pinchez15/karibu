-- ============================================================
-- KARIBU HEALTH DEMO SEED DATA
-- Southwestern Uganda clinical scenarios (Ankole/Kigezi region)
-- 12 patients, 4 with longitudinal history, 20 total visits
-- Copy-paste into Supabase SQL Editor to seed
-- ============================================================

-- ENSURE SCHEMA: Add columns from migration 011 if not already present
ALTER TABLE visits ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'eng';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS consent_id UUID;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS audio_deleted_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcript_original TEXT;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcript_english TEXT;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcription_provider TEXT;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS transcription_confidence NUMERIC;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS diarization_output JSONB;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS audio_trimmed BOOLEAN DEFAULT FALSE;

-- Create patient_consents table if not exists (from migration 011)
CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'audio_recording', 'ai_processing', 'data_storage',
    'cross_border_transfer', 'minor_guardian'
  )),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT NOT NULL CHECK (granted_by IN (
    'patient', 'guardian', 'clinician_witnessed'
  )),
  guardian_name TEXT,
  guardian_relationship TEXT,
  withdrawal_at TIMESTAMPTZ,
  consent_method TEXT NOT NULL CHECK (consent_method IN (
    'verbal_recorded', 'written_paper', 'digital_whatsapp', 'digital_app'
  )),
  consent_language TEXT NOT NULL DEFAULT 'eng',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLEANUP: Remove any previous demo data (safe to re-run)
DELETE FROM patients WHERE id IN (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000206',
  '00000000-0000-0000-0000-000000000207',
  '00000000-0000-0000-0000-000000000208',
  '00000000-0000-0000-0000-000000000209',
  '00000000-0000-0000-0000-000000000210',
  '00000000-0000-0000-0000-000000000211',
  '00000000-0000-0000-0000-000000000212'
);
DELETE FROM staff WHERE id IN (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102'
);

-- ============================================================
-- STAFF
-- ============================================================
-- NOTE: Replace 'demo_doctor_clerk_id' and 'demo_nurse_clerk_id'
-- with real Clerk user IDs after creating the demo user in Clerk.

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'demo_doctor_clerk_id',
   '30033fce-aab4-4d87-b580-191d516f60b2', 'sarah.amara@karibu.demo',
   'Dr. Sarah Amara', 'doctor', TRUE),
  ('00000000-0000-0000-0000-000000000102', 'demo_nurse_clerk_id',
   '30033fce-aab4-4d87-b580-191d516f60b2', 'joseph.kato@karibu.demo',
   'Nurse Joseph Kato', 'nurse', TRUE);

-- ============================================================
-- PATIENTS (12 — Ankole/Bakiga names, southwestern Uganda)
-- ============================================================

INSERT INTO patients (id, clinic_id, whatsapp_number, display_name, date_of_birth) VALUES
  ('00000000-0000-0000-0000-000000000201', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256704123456', 'Asiimwe Patience', '1992-03-15'),
  ('00000000-0000-0000-0000-000000000202', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256772234567', 'Mugisha Robert', '1974-06-22'),
  ('00000000-0000-0000-0000-000000000203', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256701345678', 'Natukunda Grace', '2002-01-10'),
  ('00000000-0000-0000-0000-000000000204', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256782456789', 'Tumusiime David', '2018-05-08'),
  ('00000000-0000-0000-0000-000000000205', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256774567890', 'Kyomuhendo Florence', '1968-09-14'),
  ('00000000-0000-0000-0000-000000000206', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256703678901', 'Ampumuza Joy', '2023-04-20'),
  ('00000000-0000-0000-0000-000000000207', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256771789012', 'Ninsiima Betty', '2004-11-30'),
  ('00000000-0000-0000-0000-000000000208', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256705890123', 'Twinomugisha Emmanuel', '1964-02-18'),
  ('00000000-0000-0000-0000-000000000209', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256783901234', 'Kabagambe Sarah', '2012-07-25'),
  ('00000000-0000-0000-0000-000000000210', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256702012345', 'Byamukama Peter', '1988-12-03'),
  ('00000000-0000-0000-0000-000000000211', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256776123890', 'Kemigisha Diana', '1997-08-16'),
  ('00000000-0000-0000-0000-000000000212', '30033fce-aab4-4d87-b580-191d516f60b2',
   '+256704234901', 'Owomugisha Ivan', '1971-04-05');

-- ============================================================
-- HISTORICAL VISITS (past dates — longitudinal patient journeys)
-- ============================================================

-- Asiimwe Patience V1: HIV Diagnosis (90 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000301',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'high',
  'Progressive weight loss, chronic cough, oral sores for 3 months',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '08:30',
  CURRENT_DATE - INTERVAL '90 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '10:45',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '10:45',
  'HIV infection WHO Stage 3 (oral candidiasis, weight loss >10%), CD4 189',
  'Fluconazole 200mg daily x14d, Cotrimoxazole 960mg daily',
  'Return in 2 weeks with GeneXpert results for ART initiation. Sooner if symptoms worsen.',
  'CD4 count, FBC, RBS, ALT, Creatinine, HBsAg, RPR, CXR, Sputum GeneXpert, CrAg'
);

-- Asiimwe Patience V2: ART Initiation (45 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000302',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'normal',
  'Follow-up for ART initiation, GeneXpert results',
  (CURRENT_DATE - INTERVAL '45 days') + TIME '09:00',
  CURRENT_DATE - INTERVAL '45 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '45 days') + TIME '10:00',
  (CURRENT_DATE - INTERVAL '45 days') + TIME '10:00',
  'HIV Stage 3 stable, TB excluded (GeneXpert negative), ART initiated',
  'TDF/3TC/DTG (TLD) 1 tab daily, Cotrimoxazole 960mg daily, IPT (Isoniazid 300mg + Pyridoxine 25mg) daily x6mo',
  'Return in 2 weeks for early ART review. Then monthly x3 months. Viral load at 6 months.',
  'None — baseline labs from prior visit adequate'
);

-- Mugisha Robert V1: HTN + DM Diagnosis (180 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000303',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'high',
  'Severe headaches for 2 weeks, blurred vision, increased thirst and urination',
  (CURRENT_DATE - INTERVAL '180 days') + TIME '08:15',
  CURRENT_DATE - INTERVAL '180 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '180 days') + TIME '10:30',
  (CURRENT_DATE - INTERVAL '180 days') + TIME '10:30',
  'Grade 2 Hypertension with TOD (LVH, Grade II retinopathy), Type 2 DM (HbA1c 9.4%), Diabetic peripheral neuropathy, Dyslipidemia',
  'Amlodipine 10mg daily, Enalapril 5mg BD, Metformin 500mg BD, Aspirin 75mg daily, Atorvastatin 20mg nocte',
  'Return in 2 weeks for BP review and creatinine check. Target BP <130/80. Target HbA1c <7%.',
  'FBS, HbA1c, Lipid profile, Creatinine, Urine ACR, ECG, FBC'
);

-- Mugisha Robert V2: Follow-up (90 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000304',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'normal',
  'HTN/DM follow-up, home BP averaging 148/92',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '08:45',
  CURRENT_DATE - INTERVAL '90 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '09:30',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '09:30',
  'HTN partially controlled, T2DM improving (HbA1c 8.1% from 9.4%), Microalbuminuria improving',
  'Amlodipine 10mg daily, Losartan 50mg daily (switched from enalapril — dry cough), Metformin 1000mg BD (increased), Aspirin 75mg daily, Atorvastatin 20mg nocte',
  'Return in 3 months. Recheck HbA1c, lipids, renal function, urine ACR. Add HCTZ 12.5mg if BP not at target.',
  'FBS, HbA1c, Creatinine, Potassium, Urine ACR'
);

-- Natukunda Grace V1: ANC Booking (60 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000305',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'normal',
  'ANC booking visit, approximately 20 weeks by dates',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '09:00',
  CURRENT_DATE - INTERVAL '60 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:15',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:15',
  'IUP ~20 weeks, G2P1 previous NVD, FHx pre-eclampsia (mother)',
  'Ferrous sulfate 200mg + Folic acid 400mcg daily, IPTp-SP dose 1, TT1 given',
  'Monthly ANC until 28 weeks, then fortnightly. Danger signs counseled. Birth plan discussed — deliver at HC IV.',
  'HIV, Blood group, Hb, Syphilis RPR, HBsAg, Urinalysis, RBS, Obstetric USS'
);

-- Natukunda Grace V2: ANC 24 weeks (30 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000306',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'normal',
  'ANC follow-up ~24 weeks, routine visit',
  (CURRENT_DATE - INTERVAL '30 days') + TIME '09:30',
  CURRENT_DATE - INTERVAL '30 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '30 days') + TIME '10:30',
  (CURRENT_DATE - INTERVAL '30 days') + TIME '10:30',
  'IUP ~24 weeks progressing normally, Trace proteinuria (new), FHx pre-eclampsia — close monitoring',
  'Continue FeFol daily, IPTp-SP dose 2, TT2 given, Aspirin 75mg nocte (pre-eclampsia prophylaxis initiated)',
  'Return in 4 weeks for ANC3 (~28 wk). Home BP monitoring 2x/week. Return immediately if: severe headache, visual changes, epigastric pain, facial swelling, reduced fetal movements.',
  'Hb, Urinalysis (protein monitoring)'
);

-- Tumusiime David V1: Sickle Cell VOC Crisis (120 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000307',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'urgent',
  'Severe pain in both legs and arms for 2 days, not eating',
  (CURRENT_DATE - INTERVAL '120 days') + TIME '10:00',
  CURRENT_DATE - INTERVAL '120 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '120 days') + TIME '12:00',
  (CURRENT_DATE - INTERVAL '120 days') + TIME '12:00',
  'SCD (HbSS) acute vaso-occlusive crisis, Moderate anemia (Hb 6.8), No acute chest syndrome',
  'Paracetamol 250mg QDS, Ibuprofen 100mg TDS, Tramadol 25mg Q6H PRN, IV NS 60mL/hr, Folic acid 5mg daily',
  'Discuss hydroxyurea initiation at follow-up (>=3 crises/year). Refer to MRRH sickle cell clinic. Return in 2 weeks.',
  'FBC, Reticulocytes, Blood group, Malaria RDT, Bilirubin, LDH, CXR'
);

-- Tumusiime David V2: Hydroxyurea Initiation (60 days ago)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000308',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 1, 'normal',
  'Follow-up after VOC crisis, discuss hydroxyurea',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '09:15',
  CURRENT_DATE - INTERVAL '60 days',
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:00',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:00',
  'SCD (HbSS) stable at baseline, Recurrent VOC (>=3/year) — hydroxyurea indicated, HbF 4.2%',
  'Hydroxyurea 200mg daily (10mg/kg, titrate to 20mg/kg), Folic acid 5mg daily, Zinc sulfate 10mg daily',
  'FBC every 2 weeks x2 months then monthly. Hold if ANC <1500 or Plt <80k. Increase dose by 5mg/kg every 8 wk if tolerated. MRRH sickle cell clinic in 3 months.',
  'FBC, Creatinine, ALT, HbF level'
);

-- ============================================================
-- TODAY'S VISITS (12 visits at various queue stages)
-- ============================================================

-- Asiimwe Patience V3: TB-IRIS symptoms (completed, pending_review)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000311',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'review', 'completed', 2, 'high',
  'Night sweats, productive cough, chest pain — on ART 6 weeks',
  NOW() - INTERVAL '2 hours',
  CURRENT_DATE,
  'eng', TRUE, 'pending_review',
  'TB-IRIS (immune reconstitution inflammatory syndrome), Probable pulmonary TB with pleural involvement, HIV on ART — continue',
  'Continue TLD, Continue Cotrimoxazole, Stop IPT, Paracetamol 1g QDS, Prednisolone 40mg daily x2wk then taper — if IRIS confirmed',
  'Follow-up in 48 hours with investigation results. Admit if SpO2 <93% or deterioration. Notify district TB focal person if confirmed.',
  'Sputum GeneXpert x2 (spot + early morning), CXR, FBC/ESR/CRP, LFTs, Pleural aspiration if effusion'
);

-- Mugisha Robert V3: Routine HTN/DM follow-up (ready_for_doctor)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000312',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000202',
  NULL,
  '00000000-0000-0000-0000-000000000102',
  'recording', 'ready_for_doctor', 1, 'normal',
  'HTN/DM 3-month follow-up, home BP averaging 138/86',
  NOW() - INTERVAL '150 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Natukunda Grace V3: Urgent — pre-eclampsia symptoms at 28wk (waiting)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000313',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000203',
  NULL, NULL,
  'recording', 'waiting', 11, 'urgent',
  'Severe headache and blurred vision at 28 weeks pregnancy, BP 158/102 at triage',
  NOW() - INTERVAL '15 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Tumusiime David V3: Sickle cell crisis (with_doctor)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000314',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'recording', 'with_doctor', 7, 'urgent',
  'Painful crisis — severe bone pain bilaterally since last night, on hydroxyurea',
  NOW() - INTERVAL '50 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Kyomuhendo Florence: RHD/CCF (ready_for_doctor)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000315',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000205',
  NULL,
  '00000000-0000-0000-0000-000000000102',
  'recording', 'ready_for_doctor', 3, 'high',
  'Worsening shortness of breath for 2 weeks, cannot lie flat, leg swelling',
  NOW() - INTERVAL '90 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Ampumuza Joy: Severe malaria (waiting, urgent)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000316',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000206',
  NULL, NULL,
  'recording', 'waiting', 12, 'urgent',
  '3-year-old with high fever 3 days, very pale, not eating, lethargic',
  NOW() - INTERVAL '10 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Ninsiima Betty: PUD/H. pylori (with_nurse)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000317',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000207',
  NULL,
  '00000000-0000-0000-0000-000000000102',
  'recording', 'with_nurse', 5, 'normal',
  'Burning epigastric pain after meals for 3 weeks, worse at night, dark stools',
  NOW() - INTERVAL '60 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Twinomugisha Emmanuel: Brucellosis (waiting)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000318',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000208',
  NULL, NULL,
  'recording', 'waiting', 9, 'normal',
  'On-and-off fever for 3 weeks, joint pains, drenching sweats — cattle keeper',
  NOW() - INTERVAL '35 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Kabagambe Sarah: Typhoid (with_nurse)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000319',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000209',
  NULL,
  '00000000-0000-0000-0000-000000000102',
  'recording', 'with_nurse', 8, 'normal',
  'Fever for 7 days getting worse, abdominal pain, headache, no appetite',
  NOW() - INTERVAL '45 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Byamukama Peter: Lower back pain (waiting)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000320',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000210',
  NULL, NULL,
  'recording', 'waiting', 10, 'normal',
  'Low back pain for 6 weeks radiating to left leg, worse with bending on the farm',
  NOW() - INTERVAL '25 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending'
);

-- Kemigisha Diana: Recurrent UTI (completed, pending_review)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000321',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000211',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'review', 'completed', 6, 'normal',
  'Burning on urination, frequency, urgency for 3 days — 3rd UTI in 8 months',
  NOW() - INTERVAL '60 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'pending_review',
  'Acute uncomplicated cystitis, Recurrent UTI (3rd in 8 months)',
  'Nitrofurantoin 100mg BD x5 days, Paracetamol 1g TDS PRN',
  'Return in 5 days for culture results. Return sooner if fever, flank pain, or no improvement in 48hrs. Increase water to 8+ glasses/day.',
  'Urine dipstick, Urine microscopy, Urine C&S, Pregnancy test'
);

-- Owomugisha Ivan: BPH (completed, sent)
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, nurse_id,
  status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, visit_date,
  source_language, consent_verified, review_status,
  reviewed_by, reviewed_at, finalized_at,
  diagnosis, medications, follow_up_instructions, tests_ordered
) VALUES (
  '00000000-0000-0000-0000-000000000322',
  '30033fce-aab4-4d87-b580-191d516f60b2',
  '00000000-0000-0000-0000-000000000212',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  'sent', 'completed', 4, 'normal',
  'Difficulty passing urine, weak stream, waking 3-4 times at night for 6 months',
  NOW() - INTERVAL '90 minutes',
  CURRENT_DATE,
  'eng', TRUE, 'reviewed',
  '00000000-0000-0000-0000-000000000101',
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '30 minutes',
  'Benign Prostatic Hyperplasia (IPSS 18/35, moderate), No features suspicious for malignancy, HTN controlled on amlodipine',
  'Tamsulosin 0.4mg daily at bedtime, Continue Amlodipine 5mg daily',
  'Return in 1 month for symptom review. Annual PSA, DRE, renal function. Refer urology at MRRH if IPSS >19 despite treatment or acute retention.',
  'PSA, Urinalysis, Creatinine, Renal USS, FBS'
);

-- ============================================================
-- PROVIDER NOTES — Historical Visits (finalized SOAP notes)
-- ============================================================

-- Asiimwe V1: HIV Diagnosis
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000301',
  $transcript$Patient presents with 3-month history of progressive weight loss estimated at 8kg, chronic dry cough, and recurrent painful white sores in the mouth. Night sweats for 1 month requiring bedsheet changes. Generalized fatigue with reduced work capacity, unable to tend banana plantation. Appetite markedly reduced. No diarrhea, no hemoptysis. LMP 2 weeks ago, regular. No prior HIV testing. Husband works in Kampala, visits monthly. 2 children ages 6 and 10, both well. No known TB contact. Using herbal remedies without improvement. Vitals: weight 48kg, height 162cm, BMI 18.3. Temp 37.6, heart rate 92, respiratory rate 18, BP 100/65, SpO2 97%. Cachectic appearance, mild conjunctival pallor. White adherent plaques on tongue and buccal mucosa bilaterally consistent with oral candidiasis. Bilateral cervical and axillary lymphadenopathy 1 to 2cm, firm, non-tender. Chest clear bilaterally. Abdomen soft, no organomegaly. Papular pruritic eruption on extensor surfaces of arms and upper back.$transcript$,
  $transcript$Patient presents with 3-month history of progressive weight loss estimated at 8kg, chronic dry cough, and recurrent painful white sores in the mouth. Night sweats for 1 month requiring bedsheet changes. Generalized fatigue with reduced work capacity, unable to tend banana plantation. Appetite markedly reduced. No diarrhea, no hemoptysis. LMP 2 weeks ago, regular. No prior HIV testing. Husband works in Kampala, visits monthly. 2 children ages 6 and 10, both well. No known TB contact. Using herbal remedies without improvement. Vitals: weight 48kg, height 162cm, BMI 18.3. Temp 37.6, heart rate 92, respiratory rate 18, BP 100/65, SpO2 97%. Cachectic appearance, mild conjunctival pallor. White adherent plaques on tongue and buccal mucosa bilaterally consistent with oral candidiasis. Bilateral cervical and axillary lymphadenopathy 1 to 2cm, firm, non-tender. Chest clear bilaterally. Abdomen soft, no organomegaly. Papular pruritic eruption on extensor surfaces of arms and upper back.$transcript$,
  $transcript$Patient presents with 3-month history of progressive weight loss estimated at 8kg, chronic dry cough, and recurrent painful white sores in the mouth. Night sweats for 1 month requiring bedsheet changes. Generalized fatigue with reduced work capacity, unable to tend banana plantation. Appetite markedly reduced. No diarrhea, no hemoptysis. LMP 2 weeks ago, regular. No prior HIV testing. Husband works in Kampala, visits monthly. 2 children ages 6 and 10, both well. No known TB contact. Using herbal remedies without improvement. Vitals: weight 48kg, height 162cm, BMI 18.3. Temp 37.6, heart rate 92, respiratory rate 18, BP 100/65, SpO2 97%. Cachectic appearance, mild conjunctival pallor. White adherent plaques on tongue and buccal mucosa bilaterally consistent with oral candidiasis. Bilateral cervical and axillary lymphadenopathy 1 to 2cm, firm, non-tender. Chest clear bilaterally. Abdomen soft, no organomegaly. Papular pruritic eruption on extensor surfaces of arms and upper back.$transcript$,
  'openai', 0.95,
  $note$**SOAP Note — Asiimwe Patience, 34F**

**Subjective:**
34-year-old female farmer from Ntungamo presents with 3-month history of progressive weight loss (~8 kg), chronic dry cough, and recurrent painful white sores in the mouth. Drenching night sweats for one month requiring bedsheet changes. Generalized fatigue — unable to tend to her banana plantation. Appetite markedly reduced. Denies diarrhea or hemoptysis. LMP 2 weeks ago, regular cycles. No prior HIV testing. Husband works in Kampala, visits monthly — status unknown. Two children (6 and 10 years), both well. No known TB contact. Has been using herbal remedies (omumbiri) without improvement. No significant PMHx. NKDA.

**Objective:**
- Weight: 48 kg, Height: 162 cm, BMI: 18.3 (underweight)
- T: 37.6°C, HR: 92/min regular, RR: 18/min, BP: 100/65 mmHg, SpO2: 97% RA
- General: Cachectic, mild conjunctival pallor, no jaundice, no pedal edema
- HEENT: White adherent plaques on tongue and bilateral buccal mucosa — oral candidiasis. No hairy leukoplakia. Bilateral cervical and axillary lymphadenopathy (1–2 cm, firm, non-tender, mobile)
- Chest: Symmetrical expansion, resonant, clear bilateral air entry, no crackles/wheeze
- CVS: S1 S2 normal, no murmurs
- Abdomen: Soft, non-tender, no hepatosplenomegaly
- Skin: Papular pruritic eruption on extensor surfaces of arms and upper back
- Neuro: Alert, oriented, no focal deficits

**Investigations:**
- HIV rapid (Determine): Reactive → Confirmatory (SD Bioline): Reactive
- CD4: 189 cells/μL
- FBC: Hb 10.2 g/dL, WCC 3.8 × 10⁹/L, Plt 180
- RBS: 5.1 mmol/L, ALT: 28 U/L, Creatinine: 68 μmol/L (eGFR >90)
- HBsAg: Negative, RPR: Non-reactive, Urinalysis: Normal, UPT: Negative
- CXR: No active infiltrates, no cavitation
- Sputum GeneXpert: Collected — awaiting results
- Serum CrAg: Negative

**Assessment:**
1. Newly diagnosed HIV infection — WHO Clinical Stage 3 (oral candidiasis, weight loss >10%, PPE)
2. Moderate immunosuppression (CD4 189 cells/μL)
3. Oral candidiasis — HIV-related
4. Papular pruritic eruption — HIV-associated
5. Mild anemia — likely anemia of chronic disease
6. Pulmonary TB must be excluded before ART initiation

**Plan:**
1. Fluconazole 200 mg PO daily × 14 days for oral candidiasis
2. Cotrimoxazole 960 mg PO daily — OI prophylaxis (CD4 <350)
3. Pre-ART counseling initiated — patient expresses understanding and willingness to start
4. Defer ART until GeneXpert result available (~48 hrs)
5. Nutritional counseling — high-protein diet: beans, groundnuts, eggs, silver fish
6. Partner notification — encouraged disclosure, self-test kit and Kampala referral card provided
7. Pediatric HIV testing arranged for both children at next school health outreach
8. CrAg negative — no fluconazole consolidation needed
9. IPT to be initiated after TB exclusion
10. Return in 2 weeks with GeneXpert results; sooner if worsening
11. Psychosocial support — referred to peer support group (Thursdays, 2–4 PM at HC IV)$note$,
  '{"diagnosis":"HIV Stage 3, CD4 189","medications":"Fluconazole 200mg daily x14d, CTX 960mg daily","follow_up":"2 weeks with GeneXpert results","investigations":"CD4, FBC, RBS, ALT, Cr, HBsAg, RPR, CXR, GeneXpert, CrAg"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '10:45',
  '00000000-0000-0000-0000-000000000101'
);

-- Asiimwe V2: ART Initiation
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000302',
  $transcript$Follow-up visit. GeneXpert result MTB not detected. Oral thrush resolved with fluconazole. Improved appetite, weight 49kg, gained 1kg. No new symptoms. Disclosed to sister who is supportive. Partner agreed to test next week. Good cotrimoxazole adherence, no missed doses, no side effects. Vitals: weight 49kg, BMI 18.7, temp 36.8, heart rate 78, BP 110/70. Looks improved, oral thrush resolved, abdomen normal, PPE unchanged.$transcript$,
  $transcript$Follow-up visit. GeneXpert result MTB not detected. Oral thrush resolved with fluconazole. Improved appetite, weight 49kg, gained 1kg. No new symptoms. Disclosed to sister who is supportive. Partner agreed to test next week. Good cotrimoxazole adherence, no missed doses, no side effects. Vitals: weight 49kg, BMI 18.7, temp 36.8, heart rate 78, BP 110/70. Looks improved, oral thrush resolved, abdomen normal, PPE unchanged.$transcript$,
  $transcript$Follow-up visit. GeneXpert result MTB not detected. Oral thrush resolved with fluconazole. Improved appetite, weight 49kg, gained 1kg. No new symptoms. Disclosed to sister who is supportive. Partner agreed to test next week. Good cotrimoxazole adherence, no missed doses, no side effects. Vitals: weight 49kg, BMI 18.7, temp 36.8, heart rate 78, BP 110/70. Looks improved, oral thrush resolved, abdomen normal, PPE unchanged.$transcript$,
  'openai', 0.96,
  $note$**SOAP Note — Asiimwe Patience, 34F (Follow-up)**

**Subjective:**
Returns for ART initiation. GeneXpert result: MTB not detected. Oral thrush resolved on fluconazole. Reports improved appetite over 2 weeks — weight stable at 49 kg (+1 kg). No new symptoms. Has disclosed to sister (supportive). Partner agreed to test next week. Cotrimoxazole adherence excellent — no missed doses, no side effects. Denies GI upset, rash, or headache.

**Objective:**
- Weight: 49 kg (+1 kg), BMI: 18.7
- T: 36.8°C, HR: 78/min, BP: 110/70 mmHg
- General: Looks better, still thin but less cachectic
- Oral: Thrush fully resolved, no new lesions
- Abdomen: Soft, non-tender
- Skin: PPE unchanged, not worsening

**Assessment:**
1. HIV Stage 3 — stable, TB excluded (GeneXpert negative)
2. Resolving oral candidiasis — treatment complete
3. Ready for ART initiation
4. Good social support identified
5. Nutritional recovery beginning (+1 kg)

**Plan:**
1. Initiate ART: TDF/3TC/DTG (TLD) — 1 tablet daily at bedtime
   - Counseled re: adherence, potential insomnia with DTG, nausea (take with food), drug interactions
2. Continue Cotrimoxazole 960 mg daily
3. IPT initiated: Isoniazid 300 mg + Pyridoxine 25 mg daily × 6 months
4. Issued 1-month ART supply
5. Viral load at 6 months post-initiation
6. Return in 2 weeks for early ART review, then monthly × 3 months
7. Weight monitoring — target gain 2–3 kg/month
8. Referred to peer support group (Thursdays at HC IV)$note$,
  '{"diagnosis":"HIV Stage 3 stable, TB excluded, ART initiated","medications":"TLD daily, CTX 960mg daily, IPT (INH 300mg + B6 25mg) daily x6mo","follow_up":"2 weeks for early ART review"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '45 days') + TIME '10:00',
  '00000000-0000-0000-0000-000000000101'
);

-- Mugisha V1: HTN + DM Diagnosis
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000303',
  $transcript$52-year-old cattle keeper from Bushenyi with 2-week history of severe occipital headaches worse in the mornings with blurred vision. Increased urinary frequency and excessive thirst for approximately 3 months. Numbness and tingling in both feet. Drinks traditional brew tonto regularly. Family history mother had sugar disease, father had stroke. Denies chest pain or dyspnea. Never had BP checked before. Smokes locally rolled tobacco 5 to 10 per day for 20 years. Examination: weight 89kg, height 170cm, BMI 30.8. BP 188 over 112 right arm sitting, repeated 182 over 108. Fundoscopy grade 2 hypertensive retinopathy with AV nipping and silver wiring. Apex beat forceful in 5th ICS MCL, loud A2. Reduced sensation to light touch and vibration bilaterally in stocking distribution. Reduced ankle reflexes bilaterally. Labs: random glucose 15.2, fasting glucose 12.8, HbA1c 9.4%, urine glucose 3+ protein 1+, lipids deranged, ECG shows LVH.$transcript$,
  $transcript$52-year-old cattle keeper from Bushenyi with 2-week history of severe occipital headaches worse in the mornings with blurred vision. Increased urinary frequency and excessive thirst for approximately 3 months. Numbness and tingling in both feet. Drinks traditional brew tonto regularly. Family history mother had sugar disease, father had stroke. Denies chest pain or dyspnea. Never had BP checked before. Smokes locally rolled tobacco 5 to 10 per day for 20 years. Examination: weight 89kg, height 170cm, BMI 30.8. BP 188 over 112 right arm sitting, repeated 182 over 108. Fundoscopy grade 2 hypertensive retinopathy with AV nipping and silver wiring. Apex beat forceful in 5th ICS MCL, loud A2. Reduced sensation to light touch and vibration bilaterally in stocking distribution. Reduced ankle reflexes bilaterally. Labs: random glucose 15.2, fasting glucose 12.8, HbA1c 9.4%, urine glucose 3+ protein 1+, lipids deranged, ECG shows LVH.$transcript$,
  $transcript$52-year-old cattle keeper from Bushenyi with 2-week history of severe occipital headaches worse in the mornings with blurred vision. Increased urinary frequency and excessive thirst for approximately 3 months. Numbness and tingling in both feet. Drinks traditional brew tonto regularly. Family history mother had sugar disease, father had stroke. Denies chest pain or dyspnea. Never had BP checked before. Smokes locally rolled tobacco 5 to 10 per day for 20 years. Examination: weight 89kg, height 170cm, BMI 30.8. BP 188 over 112 right arm sitting, repeated 182 over 108. Fundoscopy grade 2 hypertensive retinopathy with AV nipping and silver wiring. Apex beat forceful in 5th ICS MCL, loud A2. Reduced sensation to light touch and vibration bilaterally in stocking distribution. Reduced ankle reflexes bilaterally. Labs: random glucose 15.2, fasting glucose 12.8, HbA1c 9.4%, urine glucose 3+ protein 1+, lipids deranged, ECG shows LVH.$transcript$,
  'openai', 0.93,
  $note$**SOAP Note — Mugisha Robert, 52M**

**Subjective:**
52-year-old male cattle keeper from Bushenyi presents with 2-week history of severe occipital headaches, worse in mornings, with episodic blurred vision. Reports polyuria and polydipsia for ~3 months. Numbness and tingling in both feet. Drinks traditional brew (tonto) regularly. Family history: mother had "sugar disease," father had stroke. Denies chest pain, palpitations, or dyspnea. Never had blood pressure checked. Smokes locally rolled tobacco 5–10/day × 20 years. No prior hospitalizations. NKDA.

**Objective:**
- Weight: 89 kg, Height: 170 cm, BMI: 30.8 (obese)
- T: 36.9°C, HR: 88/min regular, RR: 16/min
- BP: 188/112 mmHg R arm sitting → repeated after 5 min rest: 182/108 mmHg. L arm: 180/110 mmHg
- General: Obese male, no acute distress, no pallor, no edema
- HEENT: Fundoscopy — Grade II hypertensive retinopathy (AV nipping, silver wiring), no papilledema
- Neck: No carotid bruits, no JVP elevation
- CVS: Apex 5th ICS MCL, forceful. S1 S2 normal, loud A2, no murmurs, no S3/S4
- Chest: Clear bilaterally
- Abdomen: Obese, soft, non-tender, no organomegaly
- Extremities: Reduced light touch and vibration sense in stocking distribution. Reduced ankle reflexes. Peripheral pulses present. No ulcers. No edema
- Monofilament: Reduced sensation at multiple plantar sites

**Investigations:**
- RBS: 15.2 mmol/L → FBS (next AM): 12.8 mmol/L → HbA1c: 9.4%
- Urine dipstick: Glucose 3+, Protein 1+, Ketones negative
- Fasting lipids: TC 6.2, LDL 4.1, HDL 0.9, TG 2.8 mmol/L
- Creatinine: 98 μmol/L (eGFR 72), Urine ACR: 8.2 mg/mmol (microalbuminuria)
- ECG: LVH (Sokolow-Lyon criteria met)
- FBC: Hb 15.1, WCC and Plt normal

**Assessment:**
1. Grade 2 Hypertension with target organ damage (LVH, Grade II retinopathy)
2. Type 2 Diabetes Mellitus — newly diagnosed, poor control (HbA1c 9.4%)
3. Diabetic peripheral neuropathy
4. Microalbuminuria — early diabetic/hypertensive nephropathy
5. Mixed dyslipidemia
6. Obesity (BMI 30.8)
7. Tobacco use disorder (20 pack-years)

**Plan:**
1. Amlodipine 10 mg PO daily (start immediately — Grade 2 HTN with TOD)
2. Enalapril 5 mg PO BD (renoprotective for microalbuminuria)
3. Metformin 500 mg PO BD with meals — start low, titrate; counseled re: GI side effects
4. Aspirin 75 mg PO daily (primary prevention — DM + HTN)
5. Atorvastatin 20 mg PO nocte (LDL >3.5 with DM)
6. Lifestyle: DASH-adapted diet (reduce salt, increase vegetables, reduce tonto), walking 30 min daily
7. Smoking cessation counseling — set quit date, discussed benefits
8. Home BP monitoring — lent clinic cuff, record AM and PM readings
9. Foot care education — daily inspection, proper footwear, avoid walking barefoot
10. DM education — hypo/hyperglycemia signs, sick day rules
11. Return in 2 weeks for BP review and creatinine check post-enalapril
12. Ophthalmology referral to MRRH for detailed fundoscopy
13. Targets: BP <130/80, HbA1c <7%$note$,
  '{"diagnosis":"Grade 2 HTN with TOD, T2DM (HbA1c 9.4%), Diabetic neuropathy, Microalbuminuria, Dyslipidemia","medications":"Amlodipine 10mg, Enalapril 5mg BD, Metformin 500mg BD, Aspirin 75mg, Atorvastatin 20mg","follow_up":"2 weeks","investigations":"FBS, HbA1c, Lipids, Cr, Urine ACR, ECG"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '180 days') + TIME '10:30',
  '00000000-0000-0000-0000-000000000101'
);

-- Mugisha V2: HTN/DM Follow-up
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000404',
  '00000000-0000-0000-0000-000000000304',
  $transcript$Three-month follow-up for hypertension and diabetes. Headaches resolved. Home BP averaging 148/92. Thirst and frequency improved. Reduced tonto to weekends only. Still smoking 3-4 per day down from 5-10. Wife cooking with less salt, more beans and vegetables. Walking to cattle kraal daily about 20 minutes each way. Metformin tolerated well. Occasional dizziness on standing quickly. Weight 86kg down 3kg. BP 152/94 sitting, no significant postural drop. Feet unchanged. Labs: fasting sugar 8.4 improving, HbA1c 8.1% down from 9.4%. Creatinine stable 92, potassium 4.2, urine ACR 6.8 improving. Reports occasional dry cough — likely enalapril side effect.$transcript$,
  $transcript$Three-month follow-up for hypertension and diabetes. Headaches resolved. Home BP averaging 148/92. Thirst and frequency improved. Reduced tonto to weekends only. Still smoking 3-4 per day down from 5-10. Wife cooking with less salt, more beans and vegetables. Walking to cattle kraal daily about 20 minutes each way. Metformin tolerated well. Occasional dizziness on standing quickly. Weight 86kg down 3kg. BP 152/94 sitting, no significant postural drop. Feet unchanged. Labs: fasting sugar 8.4 improving, HbA1c 8.1% down from 9.4%. Creatinine stable 92, potassium 4.2, urine ACR 6.8 improving. Reports occasional dry cough — likely enalapril side effect.$transcript$,
  $transcript$Three-month follow-up for hypertension and diabetes. Headaches resolved. Home BP averaging 148/92. Thirst and frequency improved. Reduced tonto to weekends only. Still smoking 3-4 per day down from 5-10. Wife cooking with less salt, more beans and vegetables. Walking to cattle kraal daily about 20 minutes each way. Metformin tolerated well. Occasional dizziness on standing quickly. Weight 86kg down 3kg. BP 152/94 sitting, no significant postural drop. Feet unchanged. Labs: fasting sugar 8.4 improving, HbA1c 8.1% down from 9.4%. Creatinine stable 92, potassium 4.2, urine ACR 6.8 improving. Reports occasional dry cough — likely enalapril side effect.$transcript$,
  'openai', 0.94,
  $note$**SOAP Note — Mugisha Robert, 52M (3-Month Follow-up)**

**Subjective:**
Returns for 3-month HTN/DM review. Headaches resolved. Home BP log averages 148/92 mmHg (range 140–162 / 88–98). Thirst and urinary frequency improved. Reduced tonto to weekends only (from daily). Smoking reduced to 3–4/day (from 5–10). Wife cooking with less salt, more beans and green vegetables. Walking to cattle kraal daily (~20 min each way). Metformin well tolerated. Occasional dizziness on standing quickly. Reports dry cough for ~1 month — suspects enalapril. No chest pain, dyspnea, or visual changes.

**Objective:**
- Weight: 86 kg (−3 kg), BMI: 29.8
- T: 36.7°C, HR: 72/min, BP sitting: 152/94 → standing: 144/88 (no significant postural drop)
- General: Improved appearance
- CVS: Apex undisplaced, S1 S2 normal, no murmurs
- Feet: Sensation still reduced distally, no ulcers, nails well-kempt
- Home BP log reviewed

**Investigations:**
- FBS: 8.4 mmol/L (↓ from 12.8)
- HbA1c: 8.1% (↓ from 9.4%)
- Creatinine: 92 μmol/L (stable, eGFR 78)
- Potassium: 4.2 mmol/L
- Urine ACR: 6.8 mg/mmol (↓ from 8.2 — improving)

**Assessment:**
1. HTN — partially controlled on amlodipine, needs second agent (enalapril causing cough)
2. T2DM — improving but above target (HbA1c 8.1%, target <7%)
3. Diabetic neuropathy — stable
4. Microalbuminuria — improving
5. ACEi cough — switch to ARB
6. Positive lifestyle changes — weight loss, diet, reduced alcohol and smoking

**Plan:**
1. Switch Enalapril → Losartan 50 mg PO daily (ARB — renoprotective, no cough)
2. Continue Amlodipine 10 mg daily
3. Increase Metformin to 1000 mg PO BD
4. Continue Atorvastatin 20 mg, Aspirin 75 mg
5. Check K+ and creatinine in 2 weeks after starting losartan
6. Continue smoking reduction — encouraged complete cessation
7. Praised weight loss and dietary changes
8. Return in 3 months for full review (HbA1c, lipids, renal, urine ACR)
9. If BP not at target by next visit, consider adding HCTZ 12.5 mg
10. Foot assessment at every visit$note$,
  '{"diagnosis":"HTN partially controlled, T2DM improving (HbA1c 8.1%), Microalbuminuria improving, ACEi cough","medications":"Amlodipine 10mg, Losartan 50mg (switched from enalapril), Metformin 1000mg BD, Aspirin 75mg, Atorvastatin 20mg","follow_up":"3 months"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '90 days') + TIME '09:30',
  '00000000-0000-0000-0000-000000000101'
);

-- Natukunda V1: ANC Booking
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000405',
  '00000000-0000-0000-0000-000000000305',
  $transcript$ANC booking. 24-year-old G2P1. LMP approximately 16 weeks ago. First pregnancy delivered normally at HC III, live boy now 3 years. No complications in first pregnancy. Current pregnancy — no bleeding, nausea resolved, mild backache. Fetal movements not yet felt. No urinary symptoms, no headaches, no swelling. Past medical history unremarkable. Family history — mother had pre-eclampsia with last pregnancy. Not on medications. Takes daily porridge with silver fish. Lives in Mbarara with husband who is a boda-boda rider. Weight 62kg, height 158cm, BMI 24.8. BP 118/72. Fundal height 18cm, FHR on Doppler 152. No edema.$transcript$,
  $transcript$ANC booking. 24-year-old G2P1. LMP approximately 16 weeks ago. First pregnancy delivered normally at HC III, live boy now 3 years. No complications in first pregnancy. Current pregnancy — no bleeding, nausea resolved, mild backache. Fetal movements not yet felt. No urinary symptoms, no headaches, no swelling. Past medical history unremarkable. Family history — mother had pre-eclampsia with last pregnancy. Not on medications. Takes daily porridge with silver fish. Lives in Mbarara with husband who is a boda-boda rider. Weight 62kg, height 158cm, BMI 24.8. BP 118/72. Fundal height 18cm, FHR on Doppler 152. No edema.$transcript$,
  $transcript$ANC booking. 24-year-old G2P1. LMP approximately 16 weeks ago. First pregnancy delivered normally at HC III, live boy now 3 years. No complications in first pregnancy. Current pregnancy — no bleeding, nausea resolved, mild backache. Fetal movements not yet felt. No urinary symptoms, no headaches, no swelling. Past medical history unremarkable. Family history — mother had pre-eclampsia with last pregnancy. Not on medications. Takes daily porridge with silver fish. Lives in Mbarara with husband who is a boda-boda rider. Weight 62kg, height 158cm, BMI 24.8. BP 118/72. Fundal height 18cm, FHR on Doppler 152. No edema.$transcript$,
  'openai', 0.96,
  $note$**SOAP Note — Natukunda Grace, 24F (ANC Booking)**

**Subjective:**
24-year-old G2P1 presents for ANC booking. LMP ~16 weeks ago (unsure of exact date). Previous pregnancy: NVD at HC III, live boy now 3 years, uneventful pregnancy and delivery. Current pregnancy: no vaginal bleeding or discharge, nausea resolved (first trimester), mild lumbar backache. Fetal movements not yet felt. No urinary symptoms, headaches, or visual changes. No leg swelling. PMHx: unremarkable. FHx: mother had pre-eclampsia in her last pregnancy. No medications. Takes daily porridge with silver fish. Lives in Mbarara with husband (boda-boda rider).

**Objective:**
- Weight: 62 kg, Height: 158 cm, BMI: 24.8 (normal pre-pregnancy BMI)
- T: 36.6°C, HR: 78/min, BP: 118/72 mmHg
- General: Well-appearing, no pallor, no jaundice, no edema
- Breasts: Symmetrical, pregnancy changes, no masses
- Abdomen: Fundal height 18 cm (~18–20 weeks), FHR 152/min on Doppler, no tenderness
- Extremities: No edema, no varicosities

**Investigations:**
- HIV: Non-reactive
- Blood group: O Rhesus positive
- Hb: 11.8 g/dL
- RPR: Non-reactive
- Urinalysis: Normal (no protein, glucose, or nitrites)
- HBsAg: Negative
- RBS: 5.8 mmol/L
- USS (portable): Single viable IUP, FHR+, EGA 19+3 weeks (concordant), posterior placenta (not low), AFI normal

**Assessment:**
1. Intrauterine pregnancy ~19–20 weeks (dates and USS concordant)
2. G2P1, previous NVD — low obstetric risk
3. Risk factor: FHx pre-eclampsia (mother) — close BP monitoring needed
4. Low-risk profile at booking

**Plan:**
1. FeFol (Ferrous sulfate 200 mg + Folic acid 400 mcg) daily
2. TT1 administered, TT2 at next visit
3. IPTp-SP dose 1 given (malaria prophylaxis in pregnancy)
4. Confirmed ITN use
5. ANC schedule: monthly until 28 weeks, fortnightly to 36, then weekly
6. Danger signs counseling: vaginal bleeding, severe headache, blurred vision, epigastric pain, reduced fetal movements, leaking fluid, fever
7. Birth preparedness: HC IV for delivery, transport plan (boda-boda savings), blood donor identified (husband — same group)
8. Nutrition: balanced diet, continue silver fish for calcium, iron-rich foods (dodo, beans, liver)
9. Close BP monitoring given FHx pre-eclampsia
10. Return 4 weeks for ANC2 (~24 weeks)$note$,
  '{"diagnosis":"IUP ~20 weeks, G2P1, FHx pre-eclampsia","medications":"FeFol daily, IPTp-SP dose 1, TT1","follow_up":"4 weeks for ANC2"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:15',
  '00000000-0000-0000-0000-000000000101'
);

-- Natukunda V2: ANC 24 weeks — trace proteinuria
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000406',
  '00000000-0000-0000-0000-000000000306',
  $transcript$ANC follow-up at approximately 24 weeks. Feeling well. Regular fetal movements since 21 weeks. No bleeding or discharge. Occasional heartburn after meals. No headaches, no visual disturbances, no upper abdominal pain. Mild ankle swelling evenings, resolves with elevation. No dysuria. Eating well, taking FeFol daily. Weight 65kg plus 3kg from booking. BP 126/78. Fundal height 24cm, cephalic presentation high, FHR 148 regular. Mild bilateral ankle edema. Hb 11.4, urinalysis shows trace protein which is new. No glucose.$transcript$,
  $transcript$ANC follow-up at approximately 24 weeks. Feeling well. Regular fetal movements since 21 weeks. No bleeding or discharge. Occasional heartburn after meals. No headaches, no visual disturbances, no upper abdominal pain. Mild ankle swelling evenings, resolves with elevation. No dysuria. Eating well, taking FeFol daily. Weight 65kg plus 3kg from booking. BP 126/78. Fundal height 24cm, cephalic presentation high, FHR 148 regular. Mild bilateral ankle edema. Hb 11.4, urinalysis shows trace protein which is new. No glucose.$transcript$,
  $transcript$ANC follow-up at approximately 24 weeks. Feeling well. Regular fetal movements since 21 weeks. No bleeding or discharge. Occasional heartburn after meals. No headaches, no visual disturbances, no upper abdominal pain. Mild ankle swelling evenings, resolves with elevation. No dysuria. Eating well, taking FeFol daily. Weight 65kg plus 3kg from booking. BP 126/78. Fundal height 24cm, cephalic presentation high, FHR 148 regular. Mild bilateral ankle edema. Hb 11.4, urinalysis shows trace protein which is new. No glucose.$transcript$,
  'openai', 0.95,
  $note$**SOAP Note — Natukunda Grace, 24F (ANC ~24 Weeks)**

**Subjective:**
Returns for ANC follow-up at ~24 weeks. Feels well. Regular fetal movements since 21 weeks. No vaginal bleeding or discharge. Occasional mild heartburn after meals. No headaches, visual disturbances, or epigastric pain. Mild ankle swelling in evenings, resolves with elevation. No dysuria. Eating well, taking FeFol daily. No mental health concerns.

**Objective:**
- Weight: 65 kg (+3 kg from booking — appropriate gain)
- BP: 126/78 mmHg (trend: 118/72 → 126/78 — mild increase, still within normal)
- General: Healthy appearance, mild bilateral ankle edema (pitting +)
- Abdomen: Fundal height 24 cm (appropriate), longitudinal lie, cephalic (high), FHR 148/min regular
- No abdominal tenderness

**Investigations:**
- Hb: 11.4 g/dL (slight decrease — physiological hemodilution)
- Urinalysis: Protein trace (NEW), glucose negative

**Assessment:**
1. IUP ~24 weeks — progressing normally, appropriate growth
2. Trace proteinuria — new finding, warrants close surveillance (risk: FHx pre-eclampsia)
3. Mild physiological ankle edema
4. Appropriate weight gain
5. BP trending upward but within normal range

**Plan:**
1. Continue FeFol daily
2. IPTp-SP dose 2 given
3. TT2 administered
4. Aspirin 75 mg PO nocte initiated — pre-eclampsia prophylaxis (FHx + trace proteinuria)
5. Urine protein monitoring at each visit; 24-hr urine protein if dipstick ≥1+
6. Home BP monitoring arranged (borrow clinic cuff, record 2×/week)
7. Pre-eclampsia warning signs reinforced: severe headache, visual changes, RUQ/epigastric pain, sudden face/hand swelling, reduced urine output
8. Dietary advice: adequate protein, calcium-rich foods (silver fish, milk), avoid excess salt
9. Elevate legs when resting
10. Return 4 weeks for ANC3 (~28 weeks) — or immediately if warning signs$note$,
  '{"diagnosis":"IUP ~24 weeks, Trace proteinuria (new), FHx pre-eclampsia","medications":"FeFol daily, IPTp-SP dose 2, TT2, Aspirin 75mg nocte","follow_up":"4 weeks for ANC3, sooner if warning signs"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '30 days') + TIME '10:30',
  '00000000-0000-0000-0000-000000000101'
);

-- Tumusiime V1: Sickle Cell VOC Crisis
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000407',
  '00000000-0000-0000-0000-000000000307',
  $transcript$8-year-old boy brought by mother with severe pain in both legs and arms for 2 days. Pain started suddenly after playing football in the evening when it was cold. Not eating well due to pain. Known sickle cell disease HbSS confirmed at age 2 at Mbarara Regional Referral Hospital. Last crisis 8 months ago managed at another facility. On folic acid 5mg daily. Not yet on hydroxyurea. Immunizations up to date. No fever, no cough, no chest pain, no difficulty breathing. Passing urine normally. Last malaria 4 months ago treated with AL. Mother reports he is in P3, generally doing well in school but misses days during crises. About 3-4 painful crises per year. No previous blood transfusions. Examination: weight 22kg, height 120cm. Temp 37.8, heart rate 110, respiratory rate 22, BP 95/60, SpO2 96%. Distressed, crying with movement. Mild scleral icterus, pallor. Chest clear, no crackles, no evidence of acute chest syndrome. Tachycardic with grade 2 systolic flow murmur. Splenomegaly 3cm below costal margin. Tender bilateral tibiae, humeri, and femora. No joint swelling.$transcript$,
  $transcript$8-year-old boy brought by mother with severe pain in both legs and arms for 2 days. Pain started suddenly after playing football in the evening when it was cold. Not eating well due to pain. Known sickle cell disease HbSS confirmed at age 2 at Mbarara Regional Referral Hospital. Last crisis 8 months ago managed at another facility. On folic acid 5mg daily. Not yet on hydroxyurea. Immunizations up to date. No fever, no cough, no chest pain, no difficulty breathing. Passing urine normally. Last malaria 4 months ago treated with AL. Mother reports he is in P3, generally doing well in school but misses days during crises. About 3-4 painful crises per year. No previous blood transfusions. Examination: weight 22kg, height 120cm. Temp 37.8, heart rate 110, respiratory rate 22, BP 95/60, SpO2 96%. Distressed, crying with movement. Mild scleral icterus, pallor. Chest clear, no crackles, no evidence of acute chest syndrome. Tachycardic with grade 2 systolic flow murmur. Splenomegaly 3cm below costal margin. Tender bilateral tibiae, humeri, and femora. No joint swelling.$transcript$,
  $transcript$8-year-old boy brought by mother with severe pain in both legs and arms for 2 days. Pain started suddenly after playing football in the evening when it was cold. Not eating well due to pain. Known sickle cell disease HbSS confirmed at age 2 at Mbarara Regional Referral Hospital. Last crisis 8 months ago managed at another facility. On folic acid 5mg daily. Not yet on hydroxyurea. Immunizations up to date. No fever, no cough, no chest pain, no difficulty breathing. Passing urine normally. Last malaria 4 months ago treated with AL. Mother reports he is in P3, generally doing well in school but misses days during crises. About 3-4 painful crises per year. No previous blood transfusions. Examination: weight 22kg, height 120cm. Temp 37.8, heart rate 110, respiratory rate 22, BP 95/60, SpO2 96%. Distressed, crying with movement. Mild scleral icterus, pallor. Chest clear, no crackles, no evidence of acute chest syndrome. Tachycardic with grade 2 systolic flow murmur. Splenomegaly 3cm below costal margin. Tender bilateral tibiae, humeri, and femora. No joint swelling.$transcript$,
  'openai', 0.92,
  $note$**SOAP Note — Tumusiime David, 8M**

**Subjective:**
8-year-old male brought by mother with severe pain in both legs and arms × 2 days. Onset sudden after playing football in the evening cold. Poor oral intake due to pain. Known SCD (HbSS) confirmed age 2 at MRRH. Last crisis 8 months ago (managed elsewhere). Currently on Folic acid 5 mg daily. Not on hydroxyurea. Immunizations UTD. No fever, cough, chest pain, or dyspnea. Normal urine output. Last malaria 4 months ago (treated with AL). Mother reports: P3 student, 3–4 crises/year, misses school during episodes. No previous transfusions.

**Objective:**
- Weight: 22 kg (5th %ile), Height: 120 cm (10th %ile)
- T: 37.8°C, HR: 110/min, RR: 22/min, BP: 95/60 mmHg, SpO2: 96% RA
- General: Distressed, crying with movement, mild scleral icterus, pallor ++
- HEENT: Pale conjunctivae, mild scleral icterus
- Chest: Clear bilaterally, no crackles — no evidence of acute chest syndrome
- CVS: Tachycardic, S1 S2 normal, Grade II systolic flow murmur (anemia-related)
- Abdomen: Splenomegaly (3 cm below costal margin), no hepatomegaly, non-tender
- MSK: Bilateral tibiae, humeri, and femora tender on palpation. No joint effusion. No dactylitis
- Capillary refill <3 sec. Moving all limbs (limited by pain)

**Investigations:**
- FBC: Hb 6.8 g/dL (baseline ~7.5), WCC 14.2, Plt 380, Reticulocytes 8.2%
- Peripheral smear: Sickle cells, target cells, polychromasia
- Blood group: B Rh positive
- Malaria RDT: Negative
- Urinalysis: Dark, bilirubin trace, no hematuria
- Bilirubin: 68 μmol/L (indirect predominant)
- LDH: 620 U/L (elevated)
- CXR: Clear lung fields — ACS excluded

**Assessment:**
1. SCD (HbSS) — acute vaso-occlusive crisis triggered by cold exposure
2. Moderate anemia (Hb 6.8, ~1 g below baseline)
3. Active hemolysis (elevated bilirubin and LDH, reticulocytosis)
4. No acute chest syndrome
5. Recurrent crises (≥3/year) — strong indication for hydroxyurea
6. Growth: below expected (5th–10th %ile) — disease + nutritional

**Plan:**
1. Analgesia (WHO ladder):
   - Paracetamol 250 mg QDS (10 mg/kg)
   - Ibuprofen 100 mg TDS with food (5 mg/kg)
   - Tramadol 25 mg Q6H PRN if uncontrolled
   - Reassess pain score Q2H
2. IV NS 0.9% at 60 mL/hr (1.5× maintenance)
3. Continue Folic acid 5 mg daily
4. Keep warm — blankets, warm drinks
5. Transfusion: Not indicated now (Hb 6.8 with reticulocytosis, hemodynamically stable). Transfuse if Hb <5 or clinical deterioration.
6. Monitor: Vitals Q4H, SpO2 continuous, strict I/O
7. Discuss hydroxyurea at follow-up (≥3 crises/year = strong indication)
8. Nutritional supplementation, zinc sulfate
9. Refer MRRH sickle cell clinic for comprehensive management plan
10. Return 2 weeks post-discharge for hydroxyurea discussion$note$,
  '{"diagnosis":"SCD (HbSS) VOC crisis, Moderate anemia (Hb 6.8), No ACS","medications":"Paracetamol 250mg QDS, Ibuprofen 100mg TDS, Tramadol 25mg PRN, IV NS, Folic acid 5mg","follow_up":"2 weeks for hydroxyurea discussion"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '120 days') + TIME '12:00',
  '00000000-0000-0000-0000-000000000101'
);

-- Tumusiime V2: Hydroxyurea Initiation
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000408',
  '00000000-0000-0000-0000-000000000308',
  $transcript$Follow-up 2 months after VOC crisis. Mother reports no further painful crises since last admission. Occasional mild bone aches after vigorous play but manageable with paracetamol. Appetite improved, eating well. Active in school, no days missed this term. Taking folic acid daily. Sleeping under ITN. Mother interested in discussing hydroxyurea. Weight 23kg plus 1kg. Height 121cm. Temp 36.8, heart rate 96, BP 90/60, SpO2 98%. Active child, no distress. Mild scleral icterus, mild pallor, both chronic. Spleen 2cm below costal margin, slightly smaller. No bony tenderness. Labs: Hb 7.6 back to baseline, WCC 11.8, platelets 410, reticulocytes 6.8%. Creatinine 32, ALT 22, bilirubin 42 all at baseline. HbF level 4.2%.$transcript$,
  $transcript$Follow-up 2 months after VOC crisis. Mother reports no further painful crises since last admission. Occasional mild bone aches after vigorous play but manageable with paracetamol. Appetite improved, eating well. Active in school, no days missed this term. Taking folic acid daily. Sleeping under ITN. Mother interested in discussing hydroxyurea. Weight 23kg plus 1kg. Height 121cm. Temp 36.8, heart rate 96, BP 90/60, SpO2 98%. Active child, no distress. Mild scleral icterus, mild pallor, both chronic. Spleen 2cm below costal margin, slightly smaller. No bony tenderness. Labs: Hb 7.6 back to baseline, WCC 11.8, platelets 410, reticulocytes 6.8%. Creatinine 32, ALT 22, bilirubin 42 all at baseline. HbF level 4.2%.$transcript$,
  $transcript$Follow-up 2 months after VOC crisis. Mother reports no further painful crises since last admission. Occasional mild bone aches after vigorous play but manageable with paracetamol. Appetite improved, eating well. Active in school, no days missed this term. Taking folic acid daily. Sleeping under ITN. Mother interested in discussing hydroxyurea. Weight 23kg plus 1kg. Height 121cm. Temp 36.8, heart rate 96, BP 90/60, SpO2 98%. Active child, no distress. Mild scleral icterus, mild pallor, both chronic. Spleen 2cm below costal margin, slightly smaller. No bony tenderness. Labs: Hb 7.6 back to baseline, WCC 11.8, platelets 410, reticulocytes 6.8%. Creatinine 32, ALT 22, bilirubin 42 all at baseline. HbF level 4.2%.$transcript$,
  'openai', 0.94,
  $note$**SOAP Note — Tumusiime David, 8M (Follow-up — Hydroxyurea Initiation)**

**Subjective:**
Returns 2 months after VOC crisis. Mother reports no further crises since discharge. Occasional mild bone aches after vigorous play — managed with paracetamol. Appetite improved, eating well. Active in school, no days missed this term. Taking Folic acid daily. Sleeping under ITN. Mother keen to discuss hydroxyurea as planned.

**Objective:**
- Weight: 23 kg (+1 kg), Height: 121 cm
- T: 36.8°C, HR: 96/min, BP: 90/60 mmHg, SpO2: 98% RA
- General: Active child, no distress, mild scleral icterus (chronic), mild pallor (chronic)
- Abdomen: Spleen 2 cm below costal margin (slightly smaller than before)
- MSK: No bony tenderness
- Growth: tracking along 5th–10th percentile

**Investigations:**
- FBC: Hb 7.6 g/dL (back to baseline), WCC 11.8, Plt 410, MCV 82 fL
- Reticulocytes: 6.8% (baseline)
- Creatinine: 32 μmol/L (normal for age)
- ALT: 22 U/L (normal)
- Bilirubin: 42 μmol/L (baseline — chronic hemolysis)
- HbF: 4.2% (low — room for improvement)

**Assessment:**
1. SCD (HbSS) — stable, at baseline
2. Recurrent VOC (≥3/year) — meets criteria for hydroxyurea
3. Baseline HbF 4.2% — target increase with hydroxyurea
4. Normal renal and hepatic function — safe to start
5. Mild growth faltering (5–10th %ile)

**Plan:**
1. Start Hydroxyurea 200 mg PO daily (10 mg/kg — using 500 mg capsule dissolved in water, 2/5 of capsule)
   - Titrate to 20 mg/kg (max tolerated dose) based on FBC
   - Expect: ↑ Hb, ↑ MCV, ↑ HbF, ↓ crisis frequency over 3–6 months
2. Continue Folic acid 5 mg daily
3. FBC monitoring: every 2 weeks × 2 months, then monthly
   - Hold if: ANC <1500, Plt <80k, Hb drops >2 g from baseline, Retics <80k
4. Dose titration: increase 5 mg/kg every 8 weeks if tolerated
5. Mother counseled: daily adherence, same time each day, signs of marrow suppression (fever, unusual bleeding, extreme fatigue)
6. Continue avoiding cold, dehydration, over-exertion
7. Zinc sulfate 10 mg PO daily for growth
8. Return 2 weeks for first FBC on hydroxyurea
9. MRRH sickle cell clinic comprehensive review in 3 months$note$,
  '{"diagnosis":"SCD (HbSS) stable, Recurrent VOC — hydroxyurea initiated, HbF 4.2%","medications":"Hydroxyurea 200mg daily, Folic acid 5mg daily, Zinc 10mg daily","follow_up":"2 weeks for FBC check, MRRH in 3 months"}'::jsonb,
  'finalized',
  (CURRENT_DATE - INTERVAL '60 days') + TIME '10:00',
  '00000000-0000-0000-0000-000000000101'
);

-- ============================================================
-- PROVIDER NOTES — Today's Completed Visits (pending review)
-- ============================================================

-- Asiimwe V3: TB-IRIS (pending_review — with transcript for review page)
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status
) VALUES (
  '00000000-0000-0000-0000-000000000411',
  '00000000-0000-0000-0000-000000000311',
  $transcript$Welcome back Patience, you were here about six weeks ago when we started your ARVs, the TLD. How have you been taking them? Patient says she takes them every day at eight o'clock in the evening, her sister reminds her, she has not missed even one day. Good, that is important. So what brings you back today? Patient reports she has been getting worse over the past two weeks. She is sweating a lot at night, her whole bed gets wet. She has a cough now bringing up whitish stuff, sometimes yellowish. And she has pain on the left side of her chest when she breathes deeply. Doctor asks about weight loss. Patient says yes, her clothes are loose again, she had started eating better after starting the medicine but now she does not feel like eating again. Any fever? Yes, she feels hot especially in the evenings and shivers at night. No headache, no eye problems. No diarrhea. No blood in the sputum. She has been taking the isoniazid every day with the ARVs as instructed. On examination weight 47kg down 2kg from last visit. Temperature 38.2, heart rate 96, respiratory rate 22, BP 105/65, oxygen saturation 95% on room air. She appears unwell, febrile, diaphoretic. Cervical lymphadenopathy now larger 2-3cm, firm, matted. Chest shows reduced air entry at left base, dull to percussion left lower zone, bronchial breathing left mid zone, bilateral scattered crackles. Liver palpable 3cm below costal margin. No peripheral edema.$transcript$,
  $transcript$Welcome back Patience, you were here about six weeks ago when we started your ARVs, the TLD. How have you been taking them? Patient says she takes them every day at eight o'clock in the evening, her sister reminds her, she has not missed even one day. Good, that is important. So what brings you back today? Patient reports she has been getting worse over the past two weeks. She is sweating a lot at night, her whole bed gets wet. She has a cough now bringing up whitish stuff, sometimes yellowish. And she has pain on the left side of her chest when she breathes deeply. Doctor asks about weight loss. Patient says yes, her clothes are loose again, she had started eating better after starting the medicine but now she does not feel like eating again. Any fever? Yes, she feels hot especially in the evenings and shivers at night. No headache, no eye problems. No diarrhea. No blood in the sputum. She has been taking the isoniazid every day with the ARVs as instructed. On examination weight 47kg down 2kg from last visit. Temperature 38.2, heart rate 96, respiratory rate 22, BP 105/65, oxygen saturation 95% on room air. She appears unwell, febrile, diaphoretic. Cervical lymphadenopathy now larger 2-3cm, firm, matted. Chest shows reduced air entry at left base, dull to percussion left lower zone, bronchial breathing left mid zone, bilateral scattered crackles. Liver palpable 3cm below costal margin. No peripheral edema.$transcript$,
  $transcript$Welcome back Patience, you were here about six weeks ago when we started your ARVs, the TLD. How have you been taking them? Patient says she takes them every day at eight o'clock in the evening, her sister reminds her, she has not missed even one day. Good, that is important. So what brings you back today? Patient reports she has been getting worse over the past two weeks. She is sweating a lot at night, her whole bed gets wet. She has a cough now bringing up whitish stuff, sometimes yellowish. And she has pain on the left side of her chest when she breathes deeply. Doctor asks about weight loss. Patient says yes, her clothes are loose again, she had started eating better after starting the medicine but now she does not feel like eating again. Any fever? Yes, she feels hot especially in the evenings and shivers at night. No headache, no eye problems. No diarrhea. No blood in the sputum. She has been taking the isoniazid every day with the ARVs as instructed. On examination weight 47kg down 2kg from last visit. Temperature 38.2, heart rate 96, respiratory rate 22, BP 105/65, oxygen saturation 95% on room air. She appears unwell, febrile, diaphoretic. Cervical lymphadenopathy now larger 2-3cm, firm, matted. Chest shows reduced air entry at left base, dull to percussion left lower zone, bronchial breathing left mid zone, bilateral scattered crackles. Liver palpable 3cm below costal margin. No peripheral edema.$transcript$,
  'openai', 0.91,
  $note$**SOAP Note — Asiimwe Patience, 34F (6-Week ART Review)**

**Subjective:**
On TLD for 6 weeks. Reports excellent adherence — takes daily at 8 PM, sister reminds her, no missed doses. Also taking IPT (Isoniazid + Pyridoxine) daily. New symptoms over past 2 weeks: drenching night sweats, productive cough (whitish-yellowish sputum), left-sided pleuritic chest pain. Weight loss despite initial improvement in appetite. Reports evening fevers with rigors. Mild insomnia since starting DTG. Denies headache, visual changes, diarrhea, hemoptysis.

**Objective:**
- Weight: 47 kg (−2 kg from 6 weeks ago), BMI: 17.9
- T: 38.2°C, HR: 96/min, RR: 22/min, BP: 105/65 mmHg, SpO2: 95% RA
- General: Febrile, appears unwell, diaphoretic
- Neck: Cervical lymphadenopathy now larger (2–3 cm), firm, matted (previously 1–2 cm, mobile)
- Chest: Reduced air entry L base, dull to percussion L lower zone, bronchial breathing L mid-zone, bilateral scattered crackles
- Abdomen: Hepatomegaly — liver 3 cm below costal margin (new finding)
- Extremities: No peripheral edema

**Assessment:**
1. TB-IRIS (Immune Reconstitution Inflammatory Syndrome) — most likely given temporal relationship with ART initiation (6 weeks), paradoxical worsening despite adherence
2. Probable pulmonary TB with left-sided pleural involvement
3. HIV on ART — CONTINUE (do not stop ART during IRIS)
4. Hepatomegaly — possible hepatic TB involvement vs. drug-induced
5. Moderate malnutrition (BMI 17.9)

**Plan:**
1. Urgent investigations:
   - Sputum GeneXpert MTB/RIF ×2 (spot + early morning)
   - CXR (AP and lateral)
   - FBC, ESR, CRP
   - LFTs (hepatic TB vs. drug-induced liver injury)
   - Pleural aspiration if significant effusion: protein, cell count, ADA, GeneXpert
2. Continue TLD — do not interrupt ART
3. Continue Cotrimoxazole
4. Stop IPT pending GeneXpert results
5. If GeneXpert positive: Start RHZE intensive phase
   - NB: Switch DTG to 50 mg BD when on Rifampicin (CYP3A4 induction)
6. Prednisolone 1 mg/kg/day (40 mg) × 2 weeks then taper over 2 weeks if IRIS confirmed
7. Paracetamol 1 g QDS for fever and pain
8. Nutritional support — RUTF (Plumpy'Nut) if available
9. Admit if SpO2 drops <93% or clinical deterioration
10. Follow-up in 48 hours with investigation results
11. Notify district TB focal person if confirmed$note$,
  '{"diagnosis":"TB-IRIS, Probable pulmonary TB with pleural involvement, HIV on ART","medications":"Continue TLD, Continue CTX, Stop IPT, Paracetamol 1g QDS, Prednisolone 40mg if IRIS confirmed","follow_up":"48 hours with investigation results","investigations":"GeneXpert x2, CXR, FBC/ESR/CRP, LFTs, Pleural aspiration"}'::jsonb,
  'draft'
);

-- Kemigisha Diana: Recurrent UTI (pending_review)
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status
) VALUES (
  '00000000-0000-0000-0000-000000000421',
  '00000000-0000-0000-0000-000000000321',
  $transcript$29-year-old female teacher presents with 3-day history of burning pain on urination, increased frequency going every 30-60 minutes, and urgency. Lower abdominal discomfort. Urine cloudy with strong odor. No fever, no flank pain, no vaginal discharge, no blood in urine. This is her third UTI in the past 8 months. Previous episodes treated with ciprofloxacin from a local pharmacy without urine culture. Sexually active with one partner, her husband. No contraception, they are trying to conceive. LMP 2 weeks ago. No history of renal stones. Drinks about 3-4 glasses of water daily. Examination: temp 36.9, heart rate 76, BP 116/70. Well-appearing. Abdomen soft with mild suprapubic tenderness. No costovertebral angle tenderness. No vulval lesions or discharge. Urine dipstick nitrites positive, leukocyte esterase 3+, blood trace, protein trace. Microscopy shows more than 100 white cells per HPF, bacteria 3+, no casts. Pregnancy test negative. Urine culture sent.$transcript$,
  $transcript$29-year-old female teacher presents with 3-day history of burning pain on urination, increased frequency going every 30-60 minutes, and urgency. Lower abdominal discomfort. Urine cloudy with strong odor. No fever, no flank pain, no vaginal discharge, no blood in urine. This is her third UTI in the past 8 months. Previous episodes treated with ciprofloxacin from a local pharmacy without urine culture. Sexually active with one partner, her husband. No contraception, they are trying to conceive. LMP 2 weeks ago. No history of renal stones. Drinks about 3-4 glasses of water daily. Examination: temp 36.9, heart rate 76, BP 116/70. Well-appearing. Abdomen soft with mild suprapubic tenderness. No costovertebral angle tenderness. No vulval lesions or discharge. Urine dipstick nitrites positive, leukocyte esterase 3+, blood trace, protein trace. Microscopy shows more than 100 white cells per HPF, bacteria 3+, no casts. Pregnancy test negative. Urine culture sent.$transcript$,
  $transcript$29-year-old female teacher presents with 3-day history of burning pain on urination, increased frequency going every 30-60 minutes, and urgency. Lower abdominal discomfort. Urine cloudy with strong odor. No fever, no flank pain, no vaginal discharge, no blood in urine. This is her third UTI in the past 8 months. Previous episodes treated with ciprofloxacin from a local pharmacy without urine culture. Sexually active with one partner, her husband. No contraception, they are trying to conceive. LMP 2 weeks ago. No history of renal stones. Drinks about 3-4 glasses of water daily. Examination: temp 36.9, heart rate 76, BP 116/70. Well-appearing. Abdomen soft with mild suprapubic tenderness. No costovertebral angle tenderness. No vulval lesions or discharge. Urine dipstick nitrites positive, leukocyte esterase 3+, blood trace, protein trace. Microscopy shows more than 100 white cells per HPF, bacteria 3+, no casts. Pregnancy test negative. Urine culture sent.$transcript$,
  'openai', 0.94,
  $note$**SOAP Note — Kemigisha Diana, 29F**

**Subjective:**
29-year-old female teacher presents with 3-day history of dysuria (burning), increased urinary frequency (Q30–60 min), and urgency. Lower abdominal discomfort. Urine cloudy with strong odor. No fever, flank pain, vaginal discharge, or hematuria. Third UTI in 8 months — previous episodes treated with ciprofloxacin from pharmacy without culture. Sexually active, one partner (husband), no contraception — TTC. LMP 2 weeks ago. No renal stone history. Fluid intake ~3–4 glasses water/day (low). NKDA.

**Objective:**
- T: 36.9°C, HR: 76/min, BP: 116/70 mmHg
- General: Well-appearing, no acute distress
- Abdomen: Soft, mild suprapubic tenderness, no CVA tenderness bilaterally
- External genitalia: Normal, no vulval lesions, no discharge

**Investigations:**
- Urine dipstick: Nitrites +, LE 3+, Blood trace, Protein trace
- Urine microscopy: >100 WBC/HPF, Bacteria +++, No casts
- UPT: Negative
- Urine C&S: Sent — results in 48–72 hrs

**Assessment:**
1. Acute uncomplicated lower UTI (cystitis) — confirmed by dipstick and microscopy
2. Recurrent UTI (3rd in 8 months) — needs evaluation if persists
3. Risk factors: low fluid intake, possibly coital-related
4. Previous fluoroquinolone overuse — resistance concern

**Plan:**
1. Nitrofurantoin 100 mg PO BD × 5 days (first-line per Uganda guidelines; avoids FQ resistance; safe if early pregnancy)
2. Avoid empiric ciprofloxacin (previous overuse, resistance risk, not recommended in women planning pregnancy)
3. Increase fluid intake to ≥8 glasses of water/day
4. Voiding hygiene: wipe front-to-back, void before and after intercourse
5. Await urine C&S — modify antibiotics if resistant organism
6. If ≥3 UTIs in 12 months, consider:
   - Renal USS to exclude structural anomaly
   - Post-void residual measurement
   - Post-coital prophylaxis (single-dose nitrofurantoin)
7. Paracetamol 1 g TDS PRN for discomfort
8. Return in 5 days for culture review and clinical assessment
9. Return sooner if: fever, flank pain, vomiting, no improvement in 48 hrs$note$,
  '{"diagnosis":"Acute uncomplicated cystitis, Recurrent UTI (3rd in 8 months)","medications":"Nitrofurantoin 100mg BD x5d, Paracetamol 1g TDS PRN","follow_up":"5 days for culture results","investigations":"Urine dipstick, microscopy, C&S, UPT"}'::jsonb,
  'draft'
);

-- Owomugisha Ivan: BPH (finalized, sent)
INSERT INTO provider_notes (
  id, visit_id, transcript, transcript_original, transcript_english,
  transcription_provider, transcription_confidence, note_content,
  structured_data, status, finalized_at, finalized_by
) VALUES (
  '00000000-0000-0000-0000-000000000422',
  '00000000-0000-0000-0000-000000000322',
  $transcript$55-year-old retired civil servant with 6-month progressive difficulty starting urination, weak stream, intermittent stream stopping and starting, post-void dribbling, and nocturia waking 3-4 times per night. Occasional incomplete emptying sensation. No blood in urine, no burning, no incontinence, no perineal pain. No weight loss, no bone pain, no fever. Has been restricting evening fluids. Past medical history hypertension on amlodipine 5mg, controlled. No diabetes. No surgery. No family history prostate cancer. Occasional beer, non-smoker. Examination: weight 76kg, BMI 26.4. BP 134/82 on amlodipine. Abdomen soft, bladder not palpable. DRE prostate symmetrically enlarged about 40g, smooth, firm-rubbery, no nodules, no tenderness, median sulcus preserved, rectal mucosa mobile. IPSS 18 out of 35 moderate. QoL 4 out of 6. PSA 3.2, urinalysis normal, creatinine 88, renal USS normal kidneys, PVR 45mL, prostate 42mL.$transcript$,
  $transcript$55-year-old retired civil servant with 6-month progressive difficulty starting urination, weak stream, intermittent stream stopping and starting, post-void dribbling, and nocturia waking 3-4 times per night. Occasional incomplete emptying sensation. No blood in urine, no burning, no incontinence, no perineal pain. No weight loss, no bone pain, no fever. Has been restricting evening fluids. Past medical history hypertension on amlodipine 5mg, controlled. No diabetes. No surgery. No family history prostate cancer. Occasional beer, non-smoker. Examination: weight 76kg, BMI 26.4. BP 134/82 on amlodipine. Abdomen soft, bladder not palpable. DRE prostate symmetrically enlarged about 40g, smooth, firm-rubbery, no nodules, no tenderness, median sulcus preserved, rectal mucosa mobile. IPSS 18 out of 35 moderate. QoL 4 out of 6. PSA 3.2, urinalysis normal, creatinine 88, renal USS normal kidneys, PVR 45mL, prostate 42mL.$transcript$,
  $transcript$55-year-old retired civil servant with 6-month progressive difficulty starting urination, weak stream, intermittent stream stopping and starting, post-void dribbling, and nocturia waking 3-4 times per night. Occasional incomplete emptying sensation. No blood in urine, no burning, no incontinence, no perineal pain. No weight loss, no bone pain, no fever. Has been restricting evening fluids. Past medical history hypertension on amlodipine 5mg, controlled. No diabetes. No surgery. No family history prostate cancer. Occasional beer, non-smoker. Examination: weight 76kg, BMI 26.4. BP 134/82 on amlodipine. Abdomen soft, bladder not palpable. DRE prostate symmetrically enlarged about 40g, smooth, firm-rubbery, no nodules, no tenderness, median sulcus preserved, rectal mucosa mobile. IPSS 18 out of 35 moderate. QoL 4 out of 6. PSA 3.2, urinalysis normal, creatinine 88, renal USS normal kidneys, PVR 45mL, prostate 42mL.$transcript$,
  'openai', 0.96,
  $note$**SOAP Note — Owomugisha Ivan, 55M**

**Subjective:**
55-year-old retired civil servant presents with 6-month progressive history of LUTS: hesitancy, weak stream, intermittency, post-void dribbling, nocturia 3–4×/night, and sensation of incomplete emptying. No hematuria, dysuria, incontinence, or perineal pain. No weight loss, bone pain, or fever. Has been restricting evening fluids. PMHx: HTN on Amlodipine 5 mg (controlled). No DM. No previous surgery. No FHx prostate cancer. Occasional beer, non-smoker.

**Objective:**
- Weight: 76 kg, BMI: 26.4
- T: 36.7°C, HR: 70/min, BP: 134/82 mmHg (on Amlodipine)
- General: Well-appearing, comfortable
- Abdomen: Soft, non-tender, bladder not palpable (voided pre-exam)
- DRE: Prostate symmetrically enlarged (~40 g est.), smooth surface, firm-rubbery, no nodules, no tenderness, median sulcus preserved, rectal mucosa mobile
- IPSS: 18/35 (moderate symptoms)
- QoL score: 4/6 (mostly dissatisfied)

**Investigations:**
- PSA: 3.2 ng/mL (normal for age, density acceptable)
- Urinalysis: Normal
- Creatinine: 88 μmol/L (eGFR >90)
- Renal USS: Both kidneys normal, no hydronephrosis. Bladder smooth wall. PVR: 45 mL (normal). Prostate: 42 mL
- FBS: 5.4 mmol/L

**Assessment:**
1. Benign Prostatic Hyperplasia — moderate LUTS (IPSS 18)
2. No features suspicious for malignancy (smooth DRE, PSA 3.2, no nodules)
3. No complications (no renal impairment, PVR <50 mL, no UTI)
4. HTN — controlled on current medication

**Plan:**
1. Tamsulosin 0.4 mg PO daily at bedtime after food (alpha-blocker for symptomatic relief)
   - Counseled: dizziness on standing (first-dose), retrograde ejaculation possible
   - Expect improvement within 1–2 weeks
2. Lifestyle:
   - Reduce caffeine and alcohol (worsen frequency)
   - No fluids 2 hrs before bed
   - Timed voiding Q3–4H
   - Double voiding technique
3. PSA monitoring: annual (baseline 3.2, track trend)
4. Continue Amlodipine 5 mg
5. If inadequate response in 3 months: consider adding Finasteride 5 mg daily (prostate >40 mL)
6. Referral criteria for urology (MRRH): IPSS >19 despite Rx, acute retention, recurrent UTI, hematuria, rising PSA
7. Annual: IPSS, PSA, renal function, DRE
8. Return 1 month for symptom review$note$,
  '{"diagnosis":"BPH moderate LUTS (IPSS 18), No malignancy features, HTN controlled","medications":"Tamsulosin 0.4mg daily, Amlodipine 5mg daily","follow_up":"1 month for symptom review, annual PSA/DRE"}'::jsonb,
  'finalized',
  NOW() - INTERVAL '30 minutes',
  '00000000-0000-0000-0000-000000000101'
);

-- ============================================================
-- PATIENT NOTE (plain language — for Owomugisha, sent visit)
-- ============================================================

INSERT INTO patient_notes (id, visit_id, content, language, status)
VALUES (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000322',
  $patient_note$Hello Mr. Owomugisha,

You visited Karibu Demo Clinic today about difficulty passing urine. After examining you and doing some tests, the good news is that this is a common condition called an enlarged prostate. It is not cancer.

Your medicine:
- Tamsulosin — Take one tablet every evening at bedtime with food. This medicine helps relax the muscles around your prostate so urine flows more easily. You may feel dizzy when you stand up quickly at first, so get up slowly.

What you can do to help:
- Drink less water, tea, or beer in the evening (stop 2 hours before bed)
- Reduce tea and coffee during the day
- When you urinate, wait a moment after finishing and try again
- Do not hold your urine too long — go every 3-4 hours

You should start feeling better within 1-2 weeks.

Come back to the clinic:
- In 1 month so we can check how the medicine is working
- Immediately if you cannot pass urine at all (this is an emergency)
- If you see blood in your urine

Continue taking your blood pressure medicine (Amlodipine) as before.

Take care,
Dr. Sarah Amara
Karibu Demo Clinic$patient_note$,
  'en',
  'finalized'
);

-- ============================================================
-- MAGIC LINK (for Owomugisha — sent visit)
-- ============================================================

INSERT INTO magic_links (id, patient_id, visit_id, token, expires_at)
VALUES (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000212',
  '00000000-0000-0000-0000-000000000322',
  'demo-magic-link-owomugisha-bph',
  NOW() + INTERVAL '48 hours'
);

-- ============================================================
-- PATIENT CONSENTS (DPPA — all demo patients, 4 required types each)
-- ============================================================

DO $$
DECLARE
  patient_ids UUID[] := ARRAY[
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000206',
    '00000000-0000-0000-0000-000000000207',
    '00000000-0000-0000-0000-000000000208',
    '00000000-0000-0000-0000-000000000209',
    '00000000-0000-0000-0000-000000000210',
    '00000000-0000-0000-0000-000000000211',
    '00000000-0000-0000-0000-000000000212'
  ];
  -- Use today's visits for consent linkage
  visit_ids UUID[] := ARRAY[
    '00000000-0000-0000-0000-000000000311',
    '00000000-0000-0000-0000-000000000312',
    '00000000-0000-0000-0000-000000000313',
    '00000000-0000-0000-0000-000000000314',
    '00000000-0000-0000-0000-000000000315',
    '00000000-0000-0000-0000-000000000316',
    '00000000-0000-0000-0000-000000000317',
    '00000000-0000-0000-0000-000000000318',
    '00000000-0000-0000-0000-000000000319',
    '00000000-0000-0000-0000-000000000320',
    '00000000-0000-0000-0000-000000000321',
    '00000000-0000-0000-0000-000000000322'
  ];
  consent_types TEXT[] := ARRAY['audio_recording', 'ai_processing', 'data_storage', 'cross_border_transfer'];
  i INT;
  j INT;
BEGIN
  FOR i IN 1..12 LOOP
    FOR j IN 1..4 LOOP
      INSERT INTO patient_consents (
        patient_id, visit_id, consent_type, granted, granted_by, consent_method, consent_language
      ) VALUES (
        patient_ids[i], visit_ids[i], consent_types[j], TRUE, 'patient', 'verbal_recorded', 'eng'
      );
    END LOOP;
  END LOOP;
END $$;
