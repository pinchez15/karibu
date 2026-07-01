'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'
import { isGuardianRelationship } from '@/lib/patient-demographics'
import { syncCriticalAlertsForVisit } from '@/lib/sync-critical-alerts'
import type {
  Patient,
  PatientLatestVitals,
  PatientTimelineEvent,
  ProviderNoteSource,
} from '@karibu/shared'

// Phase 3: read + write for the patient-first detail page. All actions are
// service-role + explicit clinic scoping (see CLAUDE.md). The new RPCs in
// migration 040 also do clinic verification when a Clerk JWT is present, but
// we never rely on that here.

// ---------------------------------------------------------------------------
// Roles + sources
// ---------------------------------------------------------------------------

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

// Matches the role gate baked into rpc_sign_provider_note (migration 039).
const SIGNING_ROLES = new Set(['admin', 'doctor', 'clinical_officer', 'midwife'])

const VALID_PATIENT_NOTE_SOURCES: ProviderNoteSource[] = [
  'phone_call',
  'follow_up',
  'lab_update',
  'pharmacy_update',
  'general',
]

function isValidPatientNoteSource(s: string): s is ProviderNoteSource {
  return (VALID_PATIENT_NOTE_SOURCES as string[]).includes(s)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Confirms the patient row exists in the caller's clinic. Returns the row,
 * or null if not found / cross-clinic.
 */
async function loadPatientForStaff(
  patientId: string,
  clinicId: string,
): Promise<Patient | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  return (data as Patient | null) ?? null
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PatientWithDerivedAge = Patient & {
  birth_year: number | null
  approximate_age: number | null
  age_recorded_at: string | null
  dob_precision: 'exact' | 'year_only' | 'age_estimate' | 'unknown'
  village: string | null
  parish: string | null
  subcounty: string | null
  district: string | null
  guardian_name: string | null
  guardian_relationship: string | null
  national_id: string | null
  /** Derived from patient_age_years() — null for dob_precision='unknown'. */
  derived_age: number | null
}

/**
 * Returns the patient row (clinic-scoped) with a derived_age computed from
 * the precision fields. Used as the canonical loader for the patient detail
 * page header.
 */
export async function getPatient(
  patientId: string,
): Promise<PatientWithDerivedAge | null> {
  const staff = await getStaff()
  if (!staff) return null

  const patient = await loadPatientForStaff(patientId, staff.clinic_id)
  if (!patient) return null

  const p = patient as PatientWithDerivedAge
  const derived = computeDerivedAge({
    dob_precision: p.dob_precision,
    date_of_birth: p.date_of_birth,
    birth_year: p.birth_year ?? null,
    approximate_age: p.approximate_age ?? null,
    age_recorded_at: p.age_recorded_at ?? null,
  })
  p.derived_age = derived
  return p
}

function computeDerivedAge(input: {
  dob_precision: 'exact' | 'year_only' | 'age_estimate' | 'unknown'
  date_of_birth: string | null
  birth_year: number | null
  approximate_age: number | null
  age_recorded_at: string | null
}): number | null {
  const now = new Date()
  if (input.dob_precision === 'exact' && input.date_of_birth) {
    const dob = new Date(`${input.date_of_birth}T00:00:00Z`)
    if (Number.isNaN(dob.getTime())) return null
    let age = now.getUTCFullYear() - dob.getUTCFullYear()
    const m = now.getUTCMonth() - dob.getUTCMonth()
    if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1
    return age >= 0 ? age : null
  }
  if (input.dob_precision === 'year_only' && input.birth_year) {
    return now.getUTCFullYear() - input.birth_year
  }
  if (
    input.dob_precision === 'age_estimate' &&
    input.approximate_age !== null &&
    input.age_recorded_at
  ) {
    const recorded = new Date(input.age_recorded_at)
    if (Number.isNaN(recorded.getTime())) return input.approximate_age
    const drift = now.getUTCFullYear() - recorded.getUTCFullYear()
    return input.approximate_age + Math.max(0, drift)
  }
  return null
}

/**
 * Calls rpc_get_patient_timeline. Cursor is exclusive: pass the oldest
 * event_at from the previous page as `cursor` to fetch the next.
 */
export async function getPatientTimeline(
  patientId: string,
  cursor?: string,
  limit: number = 50,
): Promise<PatientTimelineEvent[]> {
  const staff = await getStaff()
  if (!staff) return []

  const patient = await loadPatientForStaff(patientId, staff.clinic_id)
  if (!patient) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_get_patient_timeline', {
    p_patient_id: patientId,
    p_cursor: cursor ?? null,
    p_limit: limit,
  })
  if (error) {
    console.error('rpc_get_patient_timeline failed:', error)
    return []
  }
  return (data ?? []) as PatientTimelineEvent[]
}

/**
 * Calls rpc_get_patient_latest_vitals. Returns null if the patient has no
 * vitals recorded at all (every column null) or if the patient isn't in the
 * caller's clinic.
 */
export async function getPatientLatestVitals(
  patientId: string,
): Promise<PatientLatestVitals | null> {
  const staff = await getStaff()
  if (!staff) return null

  const patient = await loadPatientForStaff(patientId, staff.clinic_id)
  if (!patient) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_get_patient_latest_vitals', {
    p_patient_id: patientId,
  })
  if (error) {
    console.error('rpc_get_patient_latest_vitals failed:', error)
    return null
  }
  // RPC returns TABLE — Supabase deserialises a single-row TABLE function as
  // an array. Pick the first row (or null when nothing was returned).
  const rows = (data ?? []) as PatientLatestVitals[]
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Writes — patient-only (no visit) notes
// ---------------------------------------------------------------------------

/**
 * Phase 3 autosave for patient-only notes. Mirrors autosaveDraftNote from
 * Phase 2 except `p_visit_id` is null and the caller-supplied `source` is
 * preserved (one of phone_call / follow_up / lab_update / pharmacy_update /
 * general). NO patient_notes write, NO visits update, NO AI trigger — same
 * invariant as visit autosave.
 */
export async function autosaveDraftPatientNote(input: {
  note_id: string
  patient_id: string
  transcript: string
  source: ProviderNoteSource
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, patient_id, transcript, source } = input

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot author clinical notes.' }
  }
  if (!isValidPatientNoteSource(source)) {
    return { success: false, error: 'Invalid note source.' }
  }

  const patient = await loadPatientForStaff(patient_id, staff.clinic_id)
  if (!patient) return { success: false, error: 'Patient not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_upsert_provider_note', {
    p_id: note_id,
    p_visit_id: null,
    p_transcript: transcript,
    p_status: 'draft',
    p_patient_id: patient_id,
    p_source: source,
  })
  if (rpcErr) {
    return { success: false, error: `autosave failed: ${rpcErr.message}` }
  }
  return { success: true }
}

/**
 * Sign a patient-only note. Two-step lifecycle matching the visit-tied
 * signClinicianNote, minus the visit-side effects: upsert as draft, then
 * flip to signed via rpc_sign_provider_note. Does NOT touch patient_notes,
 * does NOT advance any visit, does NOT trigger AI review.
 */
export async function signPatientNote(input: {
  note_id: string
  patient_id: string
  transcript: string
  source: ProviderNoteSource
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, patient_id, source } = input
  const text = input.transcript.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before signing.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!SIGNING_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot sign clinical notes.' }
  }
  if (!isValidPatientNoteSource(source)) {
    return { success: false, error: 'Invalid note source.' }
  }

  const patient = await loadPatientForStaff(patient_id, staff.clinic_id)
  if (!patient) return { success: false, error: 'Patient not found' }

  const supabase = createServiceClient()

  // 1. Upsert the note's current text as a draft. Idempotent — repeated
  //    autosaves of the same note_id touch the same row.
  const { error: upsertErr } = await supabase.rpc('rpc_upsert_provider_note', {
    p_id: note_id,
    p_visit_id: null,
    p_transcript: text,
    p_status: 'draft',
    p_patient_id: patient_id,
    p_source: source,
  })
  if (upsertErr) {
    return { success: false, error: `provider_notes upsert failed: ${upsertErr.message}` }
  }

  // 2. Flip the row to status='signed' (sets finalized_at/by via the RPC's
  //    senior-role gate; the table-level rpc_sign_provider_note errors out
  //    if the note isn't in the caller's clinic).
  const { error: signErr } = await supabase.rpc('rpc_sign_provider_note', {
    p_id: note_id,
  })
  if (signErr) {
    return { success: false, error: `sign failed: ${signErr.message}` }
  }

  revalidatePath(`/dashboard/patients/${patient_id}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Writes — patient-only vitals (Phase 4)
// ---------------------------------------------------------------------------

export interface RecordPatientVitalsInput {
  patient_id: string
  visit_id?: string | null
  weight_kg?: number | null
  height_cm?: number | null
  temp_c?: number | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  pulse_bpm?: number | null
  resp_rate?: number | null
  spo2_pct?: number | null
  muac_cm?: number | null
  notes?: string | null
}

export interface RecordedVitals {
  id: string
  patient_id: string
  visit_id: string | null
  recorded_at: string
  weight_kg: number | null
  height_cm: number | null
  temp_c: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  pulse_bpm: number | null
  resp_rate: number | null
  spo2_pct: number | null
  muac_cm: number | null
  notes: string | null
}

function normalizeVital(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * Phase 4 — record a vitals reading for a patient. Visit-id is optional so
 * this works for both visit-tied and longitudinal (no-visit) capture. At
 * least one vital field must be present; pure "notes only" rows are
 * rejected (matches the spec: "at least one must be present").
 *
 * Returns the recorded row so the caller can drop it into an optimistic UI
 * before the page refresh round-trips.
 */
export async function recordPatientVitals(
  input: RecordPatientVitalsInput,
): Promise<
  | { success: true; vitals: RecordedVitals }
  | { success: false; error: string }
> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot record vitals.' }
  }

  const patient = await loadPatientForStaff(input.patient_id, staff.clinic_id)
  if (!patient) return { success: false, error: 'Patient not found' }

  // Coerce + normalise. Any non-finite numeric becomes null.
  const weight_kg = normalizeVital(input.weight_kg)
  const height_cm = normalizeVital(input.height_cm)
  const temp_c = normalizeVital(input.temp_c)
  const bp_systolic = normalizeVital(input.bp_systolic)
  const bp_diastolic = normalizeVital(input.bp_diastolic)
  const pulse_bpm = normalizeVital(input.pulse_bpm)
  const resp_rate = normalizeVital(input.resp_rate)
  const spo2_pct = normalizeVital(input.spo2_pct)
  const muac_cm = normalizeVital(input.muac_cm)
  const notes = input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null

  const anyMeasurement =
    weight_kg !== null ||
    height_cm !== null ||
    temp_c !== null ||
    bp_systolic !== null ||
    bp_diastolic !== null ||
    pulse_bpm !== null ||
    resp_rate !== null ||
    spo2_pct !== null ||
    muac_cm !== null

  if (!anyMeasurement) {
    return { success: false, error: 'Enter at least one vital measurement.' }
  }

  const supabase = createServiceClient()
  const id = crypto.randomUUID()
  const recordedAt = new Date().toISOString()
  const visitId = input.visit_id ?? null

  // Optional visit clinic check (the RPC also checks, but we surface a
  // friendlier error message).
  if (visitId) {
    const { data: visit } = await supabase
      .from('visits')
      .select('id, clinic_id')
      .eq('id', visitId)
      .eq('clinic_id', staff.clinic_id)
      .maybeSingle()
    if (!visit) {
      return { success: false, error: 'Visit not found' }
    }
  }

  const { error: rpcErr } = await supabase.rpc('rpc_insert_patient_vitals', {
    p_id: id,
    p_patient_id: input.patient_id,
    p_visit_id: visitId,
    p_weight_kg: weight_kg,
    p_height_cm: height_cm,
    p_temp_c: temp_c,
    p_bp_systolic: bp_systolic,
    p_bp_diastolic: bp_diastolic,
    p_pulse_bpm: pulse_bpm,
    p_resp_rate: resp_rate,
    p_spo2_pct: spo2_pct,
    p_muac_cm: muac_cm,
    p_notes: notes,
    p_recorded_at: recordedAt,
  })
  if (rpcErr) {
    return { success: false, error: `Failed to save vitals: ${rpcErr.message}` }
  }

  if (visitId) {
    await syncCriticalAlertsForVisit(
      visitId,
      staff.clinic_id,
      { dateOfBirth: patient.date_of_birth },
      {
        temp_c,
        bp_systolic,
        bp_diastolic,
        resp_rate,
        spo2_pct,
        muac_cm,
      },
    )
    revalidatePath(`/dashboard/visits/${visitId}`)
  }

  revalidatePath(`/dashboard/patients/${input.patient_id}`)

  return {
    success: true,
    vitals: {
      id,
      patient_id: input.patient_id,
      visit_id: visitId,
      recorded_at: recordedAt,
      weight_kg,
      height_cm,
      temp_c,
      bp_systolic,
      bp_diastolic,
      pulse_bpm,
      resp_rate,
      spo2_pct,
      muac_cm,
      notes,
    },
  }
}

export type UpdatePatientDemographicsInput = {
  first_name: string
  last_name: string
  village: string | null
  parish: string | null
  subcounty: string | null
  district: string | null
  guardian_name: string | null
  guardian_relationship: string | null
  whatsapp_number: string | null
}

export async function updatePatientDemographics(
  patientId: string,
  input: UpdatePatientDemographicsInput,
): Promise<
  { patient: PatientWithDerivedAge } | { error: string }
> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const firstName = input.first_name.trim()
  const lastName = input.last_name.trim()
  if (!firstName || !lastName) {
    return { error: 'First name and last name are required' }
  }

  if (
    input.guardian_relationship &&
    !isGuardianRelationship(input.guardian_relationship)
  ) {
    return { error: 'Invalid guardian relationship' }
  }

  let whatsappNumber: string | null = null
  if (input.whatsapp_number && input.whatsapp_number.trim().length > 0) {
    whatsappNumber = formatPhoneNumber(input.whatsapp_number)
    if (!isValidUgandaPhone(whatsappNumber)) {
      return { error: 'Invalid Uganda phone number. Format: +256 7XX XXX XXX' }
    }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_update_patient_demographics', {
    p_patient_id: patientId,
    p_clinic_id: staff.clinic_id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_village: input.village?.trim() || null,
    p_parish: input.parish?.trim() || null,
    p_subcounty: input.subcounty?.trim() || null,
    p_district: input.district?.trim() || null,
    p_guardian_name: input.guardian_name?.trim() || null,
    p_guardian_relationship: input.guardian_relationship?.trim() || null,
    p_whatsapp_number: whatsappNumber,
  })

  if (error) {
    console.error('updatePatientDemographics', error)
    return { error: 'Failed to update patient details' }
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  revalidatePath('/dashboard/visits')

  const updated = await getPatient(patientId)
  if (!updated) return { error: 'Patient not found after update' }
  return { patient: updated }
}
