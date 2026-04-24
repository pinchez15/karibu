'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

export async function createPatientWithVisit(formData: FormData) {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  const rawPhone = formData.get('whatsapp_number') as string
  const firstName = (formData.get('first_name') as string)?.trim() || null
  const lastName = (formData.get('last_name') as string)?.trim() || null
  const sex = (formData.get('sex') as string) || null

  if (!rawPhone) {
    return { error: 'Phone number is required' }
  }

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

  if (existing) {
    patientId = existing.id
  } else {
    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: staff.clinic_id,
        whatsapp_number: whatsappNumber,
        first_name: firstName,
        last_name: lastName,
        ...(sex === 'M' || sex === 'F' ? { sex } : {}),
      })
      .select('id')
      .single()

    if (patientError) {
      console.error('Failed to create patient:', patientError)
      return { error: 'Failed to create patient' }
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
