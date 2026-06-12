'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff, requireStaff } from '@/lib/auth'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

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
  const nationalId = nullableTrim(formData.get('national_id'))

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

  // Create a visit for today. Status starts at 'pending' — clinician will
  // dictate the SOAP note from this visit later from the dashboard or app.
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      clinic_id: staff.clinic_id,
      patient_id: patientId,
      doctor_id: staff.role === 'doctor' ? staff.id : null,
      nurse_id: staff.role === 'nurse' ? staff.id : null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (visitError) {
    console.error('Failed to create visit:', visitError)
    return { error: 'Failed to create visit' }
  }

  return { visitId: visit.id }
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

// retryVisitProcessing removed in the dictation pivot. The old behavior
// (set status='processing' + POST /functions/v1/transcribe) targeted the
// deleted ambient pipeline, both of which are gone. The new "retry an
// errored visit" path is for the clinician to navigate to the dictation
// screen and re-submit, which fires the Inngest structure-dictation
// workflow fresh.

/** Submit a pharmacy order without closing the clinical note (EHR pivot). */
export async function submitPharmacyOrder(
  visitId: string,
  medications: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = medications.trim()
  if (!trimmed) {
    return { success: false, error: 'Medications are required' }
  }

  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (
    !['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(
      staff.role,
    )
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

  const { error } = await supabase.rpc('rpc_submit_pharmacy_order', {
    p_visit_id: visitId,
    p_medications: trimmed,
    p_client_op_id: null,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
