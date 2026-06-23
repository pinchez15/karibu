export type WardFilter = 'all' | 'general' | 'maternity'

export type CensusRow = {
  id: string
  patient_id: string
  patient_name: string
  date_of_birth: string | null
  sex: string | null
  ward: string
  bed_label: string | null
  admission_type: string | null
  chief_complaint: string | null
  weight_kg: number | null
  admitted_at: string
  last_observed_at: string | null
}

export type AdmissionDetail = {
  id: string
  patient_id: string
  clinic_id: string
  ward: string
  bed_label: string | null
  chief_complaint: string | null
  admission_type: string | null
  weight_kg: number | null
  provisional_dx: string | null
  gravida: number | null
  para: number | null
  edd: string | null
  gestation_weeks: number | null
  hiv_status: string | null
  presenting_status: string | null
  admitted_at: string
  status: string
  patient: {
    id: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    date_of_birth: string | null
    sex: string | null
    patient_number: number | null
  }
}

export type AdmissionObservation = {
  id: string
  observed_at: string
  temp_c: number | null
  pulse_bpm: number | null
  resp_rate: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  spo2_pct: number | null
  avpu: string | null
  imci_not_feeding: boolean
  imci_vomiting_everything: boolean
  imci_convulsions: boolean
  imci_lethargic_unconscious: boolean
  note: string | null
}

export type MedicationOrder = {
  id: string
  drug_name: string
  dose: string | null
  route: string | null
  frequency: string | null
  instructions: string | null
  active: boolean
  created_at: string
}

export type MedicationAdmin = {
  id: string
  order_id: string
  status: 'given' | 'not_given'
  not_given_reason: string | null
  administered_at: string
}

export type AdmissionNote = {
  id: string
  note: string
  author_name: string | null
  created_at: string
}

export type InpatientVisitContext = {
  visitId: string
  tests_ordered: string | null
  lab_status: string | null
  medications: string | null
  pharmacy_order_submitted_at: string | null
}

export type ObservationInput = {
  tempC?: number | null
  pulseBpm?: number | null
  respRate?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
  spo2Pct?: number | null
  avpu?: string | null
  imciNotFeeding?: boolean
  imciVomitingEverything?: boolean
  imciConvulsions?: boolean
  imciLethargicUnconscious?: boolean
  note?: string | null
}
