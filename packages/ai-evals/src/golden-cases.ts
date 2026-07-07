export interface CaseVitals {
  temp_c?: number | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  pulse_bpm?: number | null
  resp_rate?: number | null
  spo2_pct?: number | null
  weight_kg?: number | null
  height_cm?: number | null
}

export interface GoldenCase {
  id: string
  name: string
  clinicianNote: string
  chiefComplaint: string
  vitals: CaseVitals
  patientAgeYears?: number
  patientSex?: 'male' | 'female' | 'unknown'
  /** Expected suggestion types (any match passes). Use 'none' for controls. */
  expectedTypes: string[] | 'none'
  /** When true, at least one surviving suggestion must cite a mock chunk. */
  requireCitation: boolean
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'malaria-act-without-rdt',
    name: 'Malaria: ACT prescribed without RDT',
    chiefComplaint: 'Fever for 2 days',
    vitals: { temp_c: 38.6, pulse_bpm: 102, resp_rate: 20 },
    clinicianNote: `S: 24yo woman, 2 days fever, chills, headache. No vomiting.
O: Temp 38.6°C. No pallor. Abdomen soft.
A: Malaria suspected.
P: Start Artemether-lumefantrine 6-dose course. Paracetamol PRN. Return if worse.`,
    expectedTypes: ['ask_lab', 'ask_med'],
    requireCitation: true,
  },
  {
    id: 'malaria-rdt-negative-still-act',
    name: 'Malaria: RDT negative but ACT continued',
    chiefComplaint: 'Fever',
    vitals: { temp_c: 37.8, pulse_bpm: 88 },
    clinicianNote: `S: 30yo man, fever 1 day. RDT done — negative.
O: Afebrile now after paracetamol. Well appearing.
A: Viral illness vs malaria.
P: Continue Coartem anyway to cover possible false negative. Fluids and rest.`,
    expectedTypes: ['ask_lab', 'ask_med', 'ask_dx'],
    requireCitation: true,
  },
  {
    id: 'malaria-fever-no-workup',
    name: 'Malaria: fever with no test or treatment documented',
    chiefComplaint: 'High fever and body aches',
    vitals: { temp_c: 39.1, pulse_bpm: 110, resp_rate: 22 },
    clinicianNote: `S: 19yo woman, 3 days high fever, myalgia, anorexia. Lives in endemic area.
O: Febrile, no focal findings. No pallor or jaundice.
A: Febrile illness — cause unclear.
P: Symptomatic care with paracetamol. Review in 2 days.`,
    expectedTypes: ['ask_lab'],
    requireCitation: true,
  },
  {
    id: 'malaria-complete-workup',
    name: 'Malaria: RDT positive, ACT started (control — no suggestion)',
    chiefComplaint: 'Fever',
    vitals: { temp_c: 38.2, pulse_bpm: 96 },
    clinicianNote: `S: 28yo man, fever 1 day in Busoga. No danger signs.
O: Temp 38.2°C. RDT positive for P. falciparum.
A: Uncomplicated malaria.
P: Artemether-lumefantrine per weight band. Counsel on completion. Return if vomiting or danger signs.`,
    expectedTypes: 'none',
    requireCitation: false,
  },
  {
    id: 'pneumonia-fast-breathing-child',
    name: 'Pneumonia: fast breathing, no antibiotic',
    chiefComplaint: 'Cough and fast breathing',
    vitals: { temp_c: 38.4, resp_rate: 52, pulse_bpm: 130, spo2_pct: 96, weight_kg: 12 },
    patientAgeYears: 2,
    patientSex: 'male',
    clinicianNote: `S: 2yo boy, cough 3 days, fast breathing since yesterday. Feeding OK. No convulsions.
O: RR 52/min. Mild chest indrawing noted. Temp 38.4°C. No cyanosis.
A: Acute lower respiratory infection.
P: Steam inhalation and paracetamol. Mother advised on fluids. Follow up 2 days.`,
    expectedTypes: ['ask_red_flag', 'ask_med', 'ask_dx'],
    requireCitation: true,
  },
  {
    id: 'pneumonia-chest-indrawing',
    name: 'Pneumonia: chest indrawing without referral',
    chiefComplaint: 'Difficulty breathing',
    vitals: { temp_c: 39.0, resp_rate: 48, spo2_pct: 93, weight_kg: 10 },
    patientAgeYears: 18,
    patientSex: 'female',
    clinicianNote: `S: 18mo girl, cough, poor feeding, breathing difficulty since last night.
O: Chest indrawing present. RR 48. SpO2 93%. Temp 39°C.
A: Severe pneumonia suspected.
P: Paracetamol and advise mother to return tomorrow if not improving.`,
    expectedTypes: ['ask_red_flag'],
    requireCitation: true,
  },
  {
    id: 'pneumonia-treated-correctly',
    name: 'Pneumonia: fast breathing, amoxicillin started (control)',
    chiefComplaint: 'Cough and fever',
    vitals: { temp_c: 38.7, resp_rate: 44, weight_kg: 14 },
    patientAgeYears: 3,
    patientSex: 'female',
    clinicianNote: `S: 3yo girl, cough 4 days, fever. No danger signs per mother.
O: RR 44/min (fast for age). No chest indrawing. Temp 38.7°C.
A: Pneumonia — non-severe.
P: Amoxicillin 40mg/kg/day divided BD x 5 days. Paracetamol. Return immediately if danger signs.`,
    expectedTypes: 'none',
    requireCitation: false,
  },
  {
    id: 'danger-sign-unconscious',
    name: 'Danger sign: lethargic/unresponsive child',
    chiefComplaint: 'Not waking properly',
    vitals: { temp_c: 40.1, pulse_bpm: 140, resp_rate: 32 },
    patientAgeYears: 4,
    patientSex: 'male',
    clinicianNote: `S: 4yo boy brought in lethargic, difficult to rouse, fever since yesterday.
O: Responds only to painful stimulus. Temp 40.1°C. Cap refill 3 sec.
A: Febrile encephalopathy — cause unknown.
P: Paracetamol suppository. Observe in clinic. Mother to return in morning.`,
    expectedTypes: ['ask_red_flag'],
    requireCitation: true,
  },
  {
    id: 'danger-sign-convulsions',
    name: 'Danger sign: convulsions this illness',
    chiefComplaint: 'Fever and fits',
    vitals: { temp_c: 39.5, pulse_bpm: 120 },
    patientAgeYears: 6,
    patientSex: 'female',
    clinicianNote: `S: 6yo girl, fever 2 days, had one convulsion at home this morning, now alert.
O: Temp 39.5°C. No current convulsion. Neck supple.
A: Febrile convulsion vs meningitis.
P: Paracetamol and send home with tepid sponging instructions.`,
    expectedTypes: ['ask_red_flag', 'ask_dx'],
    requireCitation: true,
  },
  {
    id: 'danger-sign-unable-to-drink',
    name: 'Danger sign: unable to drink/breastfeed',
    chiefComplaint: 'Vomiting everything',
    vitals: { temp_c: 38.0, pulse_bpm: 115, resp_rate: 28 },
    patientAgeYears: 1,
    patientSex: 'male',
    clinicianNote: `S: 11mo boy, diarrhea 2 days, vomiting all fluids since last night, refuses breast.
O: Sunken eyes, skin pinch slow. Lethargic but arousable. No convulsions.
A: Gastroenteritis with dehydration.
P: Continue ORS sips at home. Return if still vomiting tomorrow.`,
    expectedTypes: ['ask_red_flag'],
    requireCitation: true,
  },
  {
    id: 'dehydration-severe-ors-only',
    name: 'Severe dehydration treated with ORS only',
    chiefComplaint: 'Diarrhea and weakness',
    vitals: { temp_c: 36.8, pulse_bpm: 130, bp_systolic: 85, bp_diastolic: 55 },
    patientAgeYears: 22,
    patientSex: 'female',
    clinicianNote: `S: 22yo woman, watery diarrhea 3 days, too weak to stand, minimal urine.
O: Lethargic, sunken eyes, skin pinch >2 sec. BP 85/55. Dry mucosa.
A: Acute diarrhea with severe dehydration.
P: ORS 200ml after each stool. Discharge with ORS sachets.`,
    expectedTypes: ['ask_red_flag'],
    requireCitation: true,
  },
  {
    id: 'uri-simple',
    name: 'Simple URI — no antibiotics needed (control)',
    chiefComplaint: 'Runny nose',
    vitals: { temp_c: 36.9, pulse_bpm: 78, resp_rate: 16 },
    patientAgeYears: 35,
    patientSex: 'female',
    clinicianNote: `S: 35yo woman, runny nose and mild sore throat 3 days. No fever, no cough.
O: Afebrile. Pharynx mildly erythematous. Lungs clear.
A: Viral upper respiratory infection.
P: Saline nasal drops, fluids, paracetamol PRN. No antibiotics.`,
    expectedTypes: 'none',
    requireCitation: false,
  },
  {
    id: 'uri-normal-vitals-child',
    name: 'Mild cough, normal vitals (control)',
    chiefComplaint: 'Mild cough',
    vitals: { temp_c: 37.0, resp_rate: 28, pulse_bpm: 90, spo2_pct: 99, weight_kg: 16 },
    patientAgeYears: 4,
    patientSex: 'male',
    clinicianNote: `S: 4yo boy, dry cough 2 days after cold. Playing normally, eating well.
O: Temp 37°C, RR 28, SpO2 99%. Chest clear, no indrawing.
A: Post-viral cough.
P: Honey for cough at night. Return if fast breathing or fever.`,
    expectedTypes: 'none',
    requireCitation: false,
  },
  {
    id: 'typhoid-no-confirmatory-test',
    name: 'Suspected typhoid without blood culture or Widal',
    chiefComplaint: 'Prolonged fever',
    vitals: { temp_c: 38.8, pulse_bpm: 92, bp_systolic: 110, bp_diastolic: 70 },
    patientAgeYears: 27,
    patientSex: 'male',
    clinicianNote: `S: 27yo man, stepwise fever 10 days, headache, constipation. No rash.
O: Temp 38.8°C. Abdomen soft, mild RUQ tenderness. No meningism.
A: Typhoid fever suspected.
P: Start ciprofloxacin empirically. Paracetamol.`,
    expectedTypes: ['ask_lab', 'ask_dx'],
    requireCitation: true,
  },
  {
    id: 'anemia-pregnancy-no-hb',
    name: 'Pregnancy with pallor, no hemoglobin checked',
    chiefComplaint: 'Antenatal visit — fatigue',
    vitals: { temp_c: 36.7, pulse_bpm: 98, bp_systolic: 100, bp_diastolic: 60, weight_kg: 58 },
    patientAgeYears: 26,
    patientSex: 'female',
    clinicianNote: `S: 26yo G2P1 at 28 weeks, increasing fatigue and dizziness on standing.
O: Conjunctival pallor noted. BP 100/60. FHR 140. Fundal height appropriate.
A: Antenatal care — anemia suspected clinically.
P: Iron/folate supplementation continued. Next ANC in 4 weeks.`,
    expectedTypes: ['ask_lab'],
    requireCitation: true,
  },
  {
    id: 'hypertension-uncontrolled',
    name: 'Uncontrolled hypertension, no medication adjustment',
    chiefComplaint: 'Headache',
    vitals: { temp_c: 36.5, bp_systolic: 188, bp_diastolic: 112, pulse_bpm: 84 },
    patientAgeYears: 55,
    patientSex: 'male',
    clinicianNote: `S: 55yo man, headache 2 days. Known hypertensive, ran out of meds 1 week ago.
O: BP 188/112 repeated. No focal neuro signs. Fundoscopy not done.
A: Hypertensive urgency.
P: Advised to restart amlodipine at home when he buys tablets. Paracetamol for headache.`,
    expectedTypes: ['ask_med', 'ask_red_flag', 'ask_dx'],
    requireCitation: true,
  },
  {
    id: 'wound-no-tetanus',
    name: 'Deep wound without tetanus prophylaxis',
    chiefComplaint: 'Leg wound',
    vitals: { temp_c: 36.8, pulse_bpm: 80, bp_systolic: 120, bp_diastolic: 78 },
    patientAgeYears: 40,
    patientSex: 'male',
    clinicianNote: `S: 40yo man, deep laceration on shin from hoe 6 hours ago. Last tetanus >10 years ago.
O: 4cm dirty wound, no tendon exposure. Distal pulses intact.
A: Contaminated laceration.
P: Wound cleaned and dressed. Amoxicillin for 5 days. Return for dressing change.`,
    expectedTypes: ['ask_med', 'ask_history'],
    requireCitation: true,
  },
  {
    id: 'well-child-immunization',
    name: 'Well-child immunization visit (control)',
    chiefComplaint: 'Routine immunization',
    vitals: { temp_c: 36.9, pulse_bpm: 110, resp_rate: 30, weight_kg: 9.2 },
    patientAgeYears: 1,
    patientSex: 'female',
    clinicianNote: `S: 9mo girl for routine measles-rubella and OPV. No illness complaints.
O: Well nourished, active. Temp 36.9°C. Normal exam.
A: Well child for immunization.
P: MR and OPV given per schedule. Counsel on next visit.`,
    expectedTypes: 'none',
    requireCitation: false,
  },
]

export function getGoldenCase(id: string): GoldenCase | undefined {
  return GOLDEN_CASES.find((c) => c.id === id)
}
