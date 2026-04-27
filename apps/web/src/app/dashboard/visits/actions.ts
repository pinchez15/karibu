'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

type DuplicateCandidate = {
  id: string
  patient_id: number | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  date_of_birth: string | null
}

function validateDateOfBirth(dateOfBirth: string) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`)
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

async function findLikelyDuplicatePatient(
  clinicId: string,
  firstName: string,
  lastName: string,
  dateOfBirth: string,
): Promise<DuplicateCandidate | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('patients')
    .select('id, patient_id, first_name, last_name, display_name, date_of_birth')
    .eq('clinic_id', clinicId)
    .eq('date_of_birth', dateOfBirth)
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .order('created_at', { ascending: false })
    .limit(1)

  return (data?.[0] as DuplicateCandidate | undefined) ?? null
}

export async function createPatientWithVisit(formData: FormData) {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  const rawPhone = formData.get('whatsapp_number') as string
  const firstName = (formData.get('first_name') as string)?.trim() || null
  const lastName = (formData.get('last_name') as string)?.trim() || null
  const dateOfBirth = (formData.get('date_of_birth') as string)?.trim() || null
  const sex = (formData.get('sex') as string) || null
  const existingPatientId = (formData.get('existing_patient_id') as string)?.trim() || null
  const confirmDuplicate = formData.get('confirm_duplicate') === 'true'

  if (!rawPhone) {
    return { error: 'Phone number is required' }
  }
  if (!firstName || !lastName || !dateOfBirth) {
    return { error: 'First name, last name, and date of birth are required' }
  }
  const dobError = validateDateOfBirth(dateOfBirth)
  if (dobError) return { error: dobError }

  const whatsappNumber = formatPhoneNumber(rawPhone)
  if (!isValidUgandaPhone(whatsappNumber)) {
    return { error: 'Invalid Uganda phone number. Format: +256 7XX XXX XXX' }
  }

  const supabase = createServiceClient()

  // Check for existing patient at this clinic
  const { data: existing } = await supabase
    .from('patients')
    .select('id')
    .eq('clinic_id', staff.clinic_id)
    .eq('whatsapp_number', whatsappNumber)
    .single()

  let patientId: string

  if (existingPatientId) {
    patientId = existingPatientId
  } else if (existing) {
    patientId = existing.id
  } else {
    const duplicateCandidate = await findLikelyDuplicatePatient(
      staff.clinic_id,
      firstName,
      lastName,
      dateOfBirth,
    )
    if (duplicateCandidate && !confirmDuplicate) {
      return { duplicateCandidate }
    }

    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: staff.clinic_id,
        whatsapp_number: whatsappNumber,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
        ...(sex === 'M' || sex === 'F' ? { sex } : {}),
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
