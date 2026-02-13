'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

export async function createPatientWithVisit(formData: FormData) {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  const rawPhone = formData.get('whatsapp_number') as string
  const displayName = (formData.get('display_name') as string)?.trim() || null

  if (!rawPhone) {
    return { error: 'WhatsApp number is required' }
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
        display_name: displayName,
      })
      .select('id')
      .single()

    if (patientError) {
      console.error('Failed to create patient:', patientError)
      return { error: 'Failed to create patient' }
    }
    patientId = newPatient.id
  }

  // Create a visit for today
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      clinic_id: staff.clinic_id,
      patient_id: patientId,
      doctor_id: staff.role === 'doctor' ? staff.id : null,
      nurse_id: staff.role === 'nurse' ? staff.id : null,
      status: 'recording',
      source_language: 'eng',
    })
    .select('id')
    .single()

  if (visitError) {
    console.error('Failed to create visit:', visitError)
    return { error: 'Failed to create visit' }
  }

  return { visitId: visit.id }
}
