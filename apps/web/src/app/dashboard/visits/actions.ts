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

export async function saveVisitNotes(
  visitId: string,
  providerNoteId: string | null,
  providerNoteContent: string,
  patientNoteId: string | null,
  patientNoteContent: string,
) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  // Provider note: update existing or create new
  if (providerNoteId) {
    const { error } = await supabase
      .from('provider_notes')
      .update({ note_content: providerNoteContent })
      .eq('id', providerNoteId)
    if (error) {
      console.error('Failed to update provider note:', error)
      return { error: 'Failed to save provider note' }
    }
  } else if (providerNoteContent) {
    const { error } = await supabase
      .from('provider_notes')
      .insert({ visit_id: visitId, note_content: providerNoteContent })
    if (error) {
      console.error('Failed to create provider note:', error)
      return { error: 'Failed to save provider note' }
    }
  }

  // Patient note: update existing or create new
  if (patientNoteId) {
    const { error } = await supabase
      .from('patient_notes')
      .update({ content: patientNoteContent })
      .eq('id', patientNoteId)
    if (error) {
      console.error('Failed to update patient note:', error)
      return { error: 'Failed to save patient note' }
    }
  } else if (patientNoteContent) {
    const { error } = await supabase
      .from('patient_notes')
      .insert({ visit_id: visitId, content: patientNoteContent })
    if (error) {
      console.error('Failed to create patient note:', error)
      return { error: 'Failed to save patient note' }
    }
  }

  return { success: true }
}

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

export async function retryVisitProcessing(visitId: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const { error: clearError } = await supabase
    .from('visits')
    .update({ status: 'processing', error_message: null, error_at: null })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (clearError) {
    console.error('Failed to clear visit error:', clearError)
    return { error: 'Failed to retry processing' }
  }

  // Trigger reprocessing via edge function
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify({ visit_id: visitId }),
    }
  )

  if (!response.ok) {
    return { error: 'Failed to trigger reprocessing' }
  }

  return { success: true }
}
