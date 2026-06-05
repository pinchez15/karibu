/** De-identified consult bundle — no names, phone, or IDs (docs/ai-clinical-assist.md). */

export type ConsultRedactorInput = {
  dateOfBirth?: string | null
  sex?: string | null
  chiefComplaint?: string | null
  diagnosis?: string | null
  testsOrdered?: string | null
  labResults?: string | null
  medications?: string | null
  providerTranscript?: string | null
  vitals?: {
    temp_c?: number | null
    bp_systolic?: number | null
    bp_diastolic?: number | null
    pulse_bpm?: number | null
    resp_rate?: number | null
    spo2_pct?: number | null
    weight_kg?: number | null
  } | null
}

function ageBand(dateOfBirth?: string | null): string {
  if (!dateOfBirth) return 'unknown'
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return 'unknown'
  const years = Math.floor(
    (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  )
  if (years < 1) return 'infant'
  if (years < 5) return 'child_under_5'
  if (years < 18) return 'child_5_17'
  if (years < 65) return 'adult'
  return 'older_adult'
}

export function buildConsultSnapshot(input: ConsultRedactorInput): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    age_band: ageBand(input.dateOfBirth),
  }
  if (input.sex) snapshot.sex = input.sex
  if (input.chiefComplaint?.trim()) snapshot.chief_complaint = input.chiefComplaint.trim()
  if (input.diagnosis?.trim()) snapshot.diagnosis = input.diagnosis.trim()
  if (input.testsOrdered?.trim()) snapshot.tests_ordered = input.testsOrdered.trim()
  if (input.labResults?.trim()) snapshot.lab_results = input.labResults.trim()
  if (input.medications?.trim()) snapshot.medications = input.medications.trim()
  const excerpt = input.providerTranscript?.trim()
  if (excerpt) snapshot.clinical_note_excerpt = excerpt.slice(0, 4000)
  if (input.vitals) {
    const v: Record<string, number> = {}
    if (input.vitals.temp_c != null) v.temp_c = input.vitals.temp_c
    if (input.vitals.bp_systolic != null) v.bp_systolic = input.vitals.bp_systolic
    if (input.vitals.bp_diastolic != null) v.bp_diastolic = input.vitals.bp_diastolic
    if (input.vitals.pulse_bpm != null) v.pulse_bpm = input.vitals.pulse_bpm
    if (input.vitals.resp_rate != null) v.resp_rate = input.vitals.resp_rate
    if (input.vitals.spo2_pct != null) v.spo2_pct = input.vitals.spo2_pct
    if (input.vitals.weight_kg != null) v.weight_kg = input.vitals.weight_kg
    if (Object.keys(v).length > 0) snapshot.vitals = v
  }
  return snapshot
}
