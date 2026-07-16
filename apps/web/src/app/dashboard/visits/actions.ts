'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { broadcastClinicRefresh } from '@/lib/realtime-server'
import { getStaff, requireStaff } from '@/lib/auth'
import { ensureCanRegisterPatients } from '@/lib/onboarding-server'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'
import { isGuardianRelationship } from '@/lib/patient-demographics'
import {
  PrescriptionLineInputSchema,
  type PrescriptionLineInput,
} from '@/lib/validators/prescription'

export type DobPrecision = 'exact' | 'year_only' | 'age_estimate' | 'unknown'

export type DuplicateCandidate = {
  id: string
  patient_id: number | null
  first_name: string | null
  last_name: string | null
  sex: string | null
  date_of_birth: string | null
  birth_year: number | null
  approximate_age: number | null
  dob_precision: DobPrecision | null
  village: string | null
  parish: string | null
  guardian_name: string | null
  national_id: string | null
  whatsapp_number: string | null
  derived_age: number | null
  match_score: number | null
  match_reasons: string[] | null
}

function parseUgandaDateOfBirth(dateOfBirth: string) {
  const digits = dateOfBirth.replace(/\D/g, '')
  if (digits.length !== 8) return null

  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  const dob = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(dob.getTime()) ||
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return null
  }

  return dob.toISOString().slice(0, 10)
}

function validateDateOfBirth(dateOfBirth: string) {
  const parsed = parseUgandaDateOfBirth(dateOfBirth)
  if (!parsed) return 'Enter date of birth as DD-MM-YYYY'

  const dob = new Date(`${parsed}T00:00:00Z`)
  if (Number.isNaN(dob.getTime())) return 'Enter a valid date of birth'
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  if (dob > today) return 'Date of birth cannot be in the future'
  const oldest = new Date(today)
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 120)
  if (dob < oldest) return 'Date of birth looks too far in the past'
  return null
}

function formatPatientWriteError(error: { message?: string | null; details?: string | null; hint?: string | null } | null) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  if (/whatsapp_number/i.test(text) && /null/i.test(text)) {
    return 'Patient creation is blocked because this Supabase project still requires a phone number. Apply the latest patient schema migration.'
  }
  return error?.message || 'Failed to create patient'
}

function nullableTrim(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseNumericInput(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (str.length === 0) return null
  const n = Number(str)
  if (!Number.isFinite(n)) return null
  return n
}

function isValidPrecision(value: string | null): value is DobPrecision {
  return value === 'exact' || value === 'year_only' || value === 'age_estimate' || value === 'unknown'
}

// Compute an effective age (in years) from the precision + populated fields,
// mirroring the SQL patient_age_years() helper. Used to feed the duplicate
// candidate RPC's age band.
function computeEffectiveAge(args: {
  precision: DobPrecision
  dateOfBirth: string | null
  birthYear: number | null
  approximateAge: number | null
}): number | null {
  const now = new Date()
  if (args.precision === 'exact' && args.dateOfBirth) {
    const dob = new Date(`${args.dateOfBirth}T00:00:00Z`)
    if (Number.isNaN(dob.getTime())) return null
    let age = now.getUTCFullYear() - dob.getUTCFullYear()
    const m = now.getUTCMonth() - dob.getUTCMonth()
    if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1
    return age >= 0 ? age : null
  }
  if (args.precision === 'year_only' && args.birthYear) {
    return now.getUTCFullYear() - args.birthYear
  }
  if (args.precision === 'age_estimate' && args.approximateAge !== null) {
    // Just-registered, so age_recorded_at == today => no drift to add.
    return args.approximateAge
  }
  return null
}

async function findDuplicateCandidatesRpc(args: {
  clinicId: string
  firstName: string
  lastName: string
  village: string | null
  parish: string | null
  age: number | null
  sex: string | null
}): Promise<DuplicateCandidate[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_find_duplicate_candidates', {
    p_clinic_id: args.clinicId,
    p_first_name: args.firstName,
    p_last_name: args.lastName,
    p_village: args.village,
    p_parish: args.parish,
    p_age: args.age,
    p_sex: args.sex,
  })
  if (error) {
    console.error('rpc_find_duplicate_candidates failed:', error)
    return []
  }
  return (data ?? []) as DuplicateCandidate[]
}

export async function findPatientCandidates(input: {
  first_name: string
  last_name: string
  village?: string | null
  parish?: string | null
  age?: number | null
  sex?: string | null
}): Promise<{ candidates: DuplicateCandidate[]; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { candidates: [], error: 'Not authenticated' }

  const firstName = input.first_name?.trim() ?? ''
  const lastName = input.last_name?.trim() ?? ''
  if (firstName.length < 2 && lastName.length < 2) {
    return { candidates: [] }
  }

  const candidates = await findDuplicateCandidatesRpc({
    clinicId: staff.clinic_id,
    firstName,
    lastName,
    village: input.village?.trim() || null,
    parish: input.parish?.trim() || null,
    age: input.age ?? null,
    sex: input.sex === 'M' || input.sex === 'F' ? input.sex : null,
  })
  return { candidates }
}

export async function createPatientWithVisit(formData: FormData) {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  const rawPhone = formData.get('whatsapp_number') as string
  const firstName = nullableTrim(formData.get('first_name'))
  const lastName = nullableTrim(formData.get('last_name'))
  const sex = (formData.get('sex') as string) || null
  const existingPatientId = nullableTrim(formData.get('existing_patient_id'))
  const confirmDuplicate = formData.get('confirm_duplicate') === 'true'

  const precisionInput = nullableTrim(formData.get('dob_precision')) ?? 'unknown'
  const precision: DobPrecision = isValidPrecision(precisionInput) ? precisionInput : 'unknown'
  const dateOfBirthInput = nullableTrim(formData.get('date_of_birth'))
  const birthYearInput = parseNumericInput(formData.get('birth_year'))
  const approximateAgeInput = parseNumericInput(formData.get('approximate_age'))

  const village = nullableTrim(formData.get('village'))
  const parish = nullableTrim(formData.get('parish'))
  const subcounty = nullableTrim(formData.get('subcounty'))
  const district = nullableTrim(formData.get('district'))
  const guardianName = nullableTrim(formData.get('guardian_name'))
  const guardianRelationshipRaw = nullableTrim(formData.get('guardian_relationship'))
  const nationalId = nullableTrim(formData.get('national_id'))

  if (guardianRelationshipRaw && !isGuardianRelationship(guardianRelationshipRaw)) {
    return { error: 'Invalid guardian relationship' }
  }
  const guardianRelationship = guardianRelationshipRaw

  if (!firstName || !lastName) {
    return { error: 'First name and last name are required' }
  }
  // Sex is required for HMIS banding (existing behaviour).
  if (sex !== 'M' && sex !== 'F') {
    return { error: 'Sex is required' }
  }

  // Per-precision validation.
  let dateOfBirth: string | null = null
  let birthYear: number | null = null
  let approximateAge: number | null = null
  let ageRecordedAt: string | null = null
  const currentYear = new Date().getUTCFullYear()

  if (precision === 'exact') {
    if (!dateOfBirthInput) return { error: 'Date of birth is required for exact precision' }
    const dobError = validateDateOfBirth(dateOfBirthInput)
    if (dobError) return { error: dobError }
    dateOfBirth = parseUgandaDateOfBirth(dateOfBirthInput)
    if (!dateOfBirth) return { error: 'Enter date of birth as DD-MM-YYYY' }
  } else if (precision === 'year_only') {
    if (birthYearInput === null) return { error: 'Birth year is required' }
    if (!Number.isInteger(birthYearInput) || birthYearInput < 1900 || birthYearInput > currentYear) {
      return { error: `Birth year must be between 1900 and ${currentYear}` }
    }
    birthYear = birthYearInput
  } else if (precision === 'age_estimate') {
    if (approximateAgeInput === null) return { error: 'Approximate age is required' }
    if (!Number.isInteger(approximateAgeInput) || approximateAgeInput < 0 || approximateAgeInput > 130) {
      return { error: 'Approximate age must be between 0 and 130' }
    }
    approximateAge = approximateAgeInput
    ageRecordedAt = new Date().toISOString()
  }
  // 'unknown' → no age fields populated

  // Phone is optional — many patients in the catchment don't carry one. Only
  // validate format when something was provided.
  let whatsappNumber: string | null = null
  if (rawPhone && rawPhone.trim().length > 0) {
    whatsappNumber = formatPhoneNumber(rawPhone)
    if (!isValidUgandaPhone(whatsappNumber)) {
      return { error: 'Invalid Uganda phone number. Format: +256 7XX XXX XXX' }
    }
  }

  const supabase = createServiceClient()

  // If a phone was provided, look up an existing patient at this clinic by
  // phone (the cheapest dedupe). Without a phone, fall through to the
  // duplicate-candidates RPC below.
  let existing: { id: string } | null = null
  if (whatsappNumber) {
    const { data } = await supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', staff.clinic_id)
      .is('retired_at', null)
      .eq('whatsapp_number', whatsappNumber)
      .maybeSingle()
    existing = data ?? null
  }

  let patientId: string

  if (existingPatientId) {
    patientId = existingPatientId
  } else if (existing) {
    patientId = existing.id
  } else {
    const effectiveAge = computeEffectiveAge({
      precision,
      dateOfBirth,
      birthYear,
      approximateAge,
    })

    const candidates = await findDuplicateCandidatesRpc({
      clinicId: staff.clinic_id,
      firstName,
      lastName,
      village,
      parish,
      age: effectiveAge,
      sex,
    })

    if (candidates.length > 0 && !confirmDuplicate) {
      return { duplicateCandidates: candidates }
    }

    const onboardingBlock = ensureCanRegisterPatients(staff)
    if (onboardingBlock.error) return { error: onboardingBlock.error }

    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: staff.clinic_id,
        whatsapp_number: whatsappNumber,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
        birth_year: birthYear,
        approximate_age: approximateAge,
        age_recorded_at: ageRecordedAt,
        dob_precision: precision,
        village,
        parish,
        subcounty,
        district,
        guardian_name: guardianName,
        guardian_relationship: guardianRelationship,
        national_id: nationalId,
        sex,
      })
      .select('id')
      .single()

    if (patientError) {
      console.error('Failed to create patient:', patientError)
      return { error: formatPatientWriteError(patientError) }
    }
    patientId = newPatient.id
  }

  // WP2 (A1): registration and check-in are decoupled. "Register + check in"
  // (default) creates the patient AND today's visit; "Register only" creates
  // just the patient record (e.g. the mother of a sick child registered for
  // the catchment, with no visit today). The register-only case appears in
  // patient search but on no queue.
  const checkIn = formData.get('check_in') !== 'false'
  if (!checkIn) {
    broadcastClinicRefresh(staff.clinic_id).catch(() => {})
    revalidatePath('/dashboard/visits')
    return { patientId }
  }

  // Check the patient into today's OPD queue so clinicians see them on Today
  // and worklists. check_in_patient assigns today's number + checked_in_at.
  const chiefComplaint = nullableTrim(formData.get('chief_complaint'))
  const { data: visitId, error: visitError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: patientId,
    p_chief_complaint: chiefComplaint,
    p_priority: 'normal',
    p_staff_id: staff.id,
    p_department: 'opd',
  })

  if (visitError || !visitId) {
    console.error('Failed to check in patient:', visitError)
    return { error: visitError?.message || 'Failed to add patient to today\'s queue' }
  }

  broadcastClinicRefresh(staff.clinic_id).catch(() => {})
  revalidatePath('/dashboard/opd')
  revalidatePath('/dashboard/worklists')

  return { visitId: visitId as string, patientId }
}

/**
 * Check an already-registered patient into today's OPD queue (WP2 A2). Powers
 * the one-tap "Check in for today" on existing-patient search results. Assigns
 * today's number (N+1) via check_in_patient.
 */
export async function checkInExistingPatient(
  patientId: string,
  chiefComplaint?: string,
): Promise<{ visitId: string } | { error: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const onboardingBlock = ensureCanRegisterPatients(staff)
  if (onboardingBlock.error) return { error: onboardingBlock.error }

  const supabase = createServiceClient()

  // Ownership pre-check: service-role bypasses RLS, so confirm the patient
  // belongs to the caller's clinic before checking them in.
  const { data: patient } = await supabase
    .from('patients')
    .select('id, retired_at')
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { error: 'Patient not found' }
  if (patient.retired_at) {
    return {
      error:
        'This patient record was retired as a duplicate. Check in the surviving record instead.',
    }
  }

  const { data: visitId, error: visitError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: patientId,
    p_chief_complaint: chiefComplaint?.trim() || null,
    p_priority: 'normal',
    p_staff_id: staff.id,
    p_department: 'opd',
  })

  if (visitError || !visitId) {
    console.error('Failed to check in patient:', visitError)
    return { error: visitError?.message || "Failed to add patient to today's queue" }
  }

  broadcastClinicRefresh(staff.clinic_id).catch(() => {})
  revalidatePath('/dashboard/opd')
  revalidatePath('/dashboard/worklists')
  revalidatePath('/dashboard/visits')

  return { visitId: visitId as string }
}

// saveVisitNotes removed in the dictation pivot. Pre-pivot it was used by
// VisitDetailClient's per-textarea editor (provider note + patient note,
// each independently dictated and saved). The new model is "dictate once,
// AI structures, clinician approves or rejects on the review queue" — note
// edits go through saveProviderNoteEdit (apps/web/src/app/dashboard/review/
// actions.ts), not this file.

export async function updatePatientSex(patientId: string, sex: 'M' | 'F') {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('patients')
    .update({ sex })
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)

  if (error) {
    console.error('Failed to update patient sex:', error)
    return { error: 'Failed to update patient sex' }
  }

  return { success: true }
}

/** Quick age capture for HMIS disaggregation (age estimate). */
export async function updatePatientAgeEstimate(patientId: string, approximateAge: number) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }
  if (!Number.isFinite(approximateAge) || approximateAge < 0 || approximateAge > 120) {
    return { error: 'Enter a valid age between 0 and 120' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('patients')
    .update({
      approximate_age: Math.round(approximateAge),
      age_recorded_at: new Date().toISOString().slice(0, 10),
      dob_precision: 'age_estimate',
      date_of_birth: null,
      birth_year: null,
    })
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)

  if (error) {
    console.error('Failed to update patient age:', error)
    return { error: 'Failed to update patient age' }
  }

  return { success: true }
}

// retryVisitProcessing removed in the dictation pivot. The old behavior
// (set status='processing' + POST /functions/v1/transcribe) targeted the
// deleted ambient pipeline, both of which are gone. The new "retry an
// errored visit" path is for the clinician to navigate to the dictation
// screen and re-submit, which fires the Inngest structure-dictation
// workflow fresh.

/** Submit structured pharmacy order (migration 064). Note may remain open. */
export async function submitPharmacyOrder(
  visitId: string,
  input:
    | string
    | {
        lines: PrescriptionLineInput[]
        medicationsSummary?: string
      },
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (
    !['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staff.role)
  ) {
    return { success: false, error: 'Forbidden: clinician role required' }
  }

  const supabase = createServiceClient()

  // Ownership pre-check: service-role client bypasses RLS, so confirm the
  // visit belongs to the caller's clinic before invoking the RPC.
  const { data: visit } = await supabase
    .from('visits')
    .select('id')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!visit) {
    return { success: false, error: 'Visit not found' }
  }

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) {
      return { success: false, error: 'Medications are required' }
    }
    const { error } = await supabase.rpc('rpc_submit_pharmacy_order', {
      p_visit_id: visitId,
      p_medications: trimmed,
      p_lines: null,
      p_client_op_id: null,
    })
    if (error) return { success: false, error: error.message }
  } else {
    if (!input.lines.length) {
      return { success: false, error: 'Add at least one prescription line' }
    }
    // Validate every line against the structured schema. This throws on any
    // non-human source (e.g. ai_suggested) and on malformed enums — the RPC
    // gate is the true barrier, but parsing here fails fast with a clear error.
    let lines: PrescriptionLineInput[]
    try {
      lines = input.lines.map((line) => PrescriptionLineInputSchema.parse(line))
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Invalid prescription line'
      return { success: false, error: `Invalid prescription line: ${message}` }
    }
    const summary =
      input.medicationsSummary?.trim() ||
      lines
        .map((l) => l.free_text_name || l.medication_code)
        .filter(Boolean)
        .join('\n')
    const { error } = await supabase.rpc('rpc_submit_pharmacy_order', {
      p_visit_id: visitId,
      p_medications: summary,
      p_lines: lines,
      p_client_op_id: null,
    })
    if (error) return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath(`/dashboard/visits/${visitId}`)
  revalidatePath('/dashboard/worklists')
  void broadcastClinicRefresh(staff.clinic_id)
  return { success: true }
}

/**
 * Order lab tests from the catalog (F2 — deterministic ordering for labs).
 * Writes exact catalog test names into visits.tests_ordered (no free text, so
 * the bench never sees a misspelling) and sets lab_status='pending'. Merges
 * with any tests already on the visit.
 */
export async function submitLabOrder(
  visitId: string,
  tests: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  if (!['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staff.role)) {
    return { success: false, error: 'Forbidden: clinician role required' }
  }
  const clean = tests.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return { success: false, error: 'Select at least one test.' }

  const supabase = createServiceClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('id, tests_ordered')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!visit) return { success: false, error: 'Visit not found' }

  const existing = String(visit.tests_ordered ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const merged = Array.from(new Set([...existing, ...clean]))

  const { error } = await supabase
    .from('visits')
    .update({ tests_ordered: merged.join(', '), lab_status: 'pending' })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/lab')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}

/**
 * Book a follow-up appointment for a patient (F-SCHED / request A). Appears on
 * the Today calendar. Decoupled from the visit — it's a future scheduled event.
 */
export async function createFollowUp(input: {
  patientId: string
  scheduledAt: string
  reason?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  if (!['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'].includes(staff.role)) {
    return { success: false, error: 'Forbidden: clinician role required' }
  }
  if (!input.scheduledAt) return { success: false, error: 'Pick a follow-up date.' }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', input.patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }

  const { error } = await supabase.rpc('rpc_create_appointment', {
    p_clinic_id: staff.clinic_id,
    p_event_type: 'follow_up',
    p_scheduled_at: new Date(input.scheduledAt).toISOString(),
    p_patient_id: input.patientId,
    p_title: null,
    p_reason: input.reason?.trim() || null,
    p_unit: 'opd',
    p_scheduled_end: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}
