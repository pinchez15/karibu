'use server'

import { createServiceClient } from '@/lib/supabase'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

interface CheckInData {
  clinicSlug: string
  name: string
  phone: string
  reasonForVisit: string
  isNewPatient: boolean
}

export async function checkInPatient(data: CheckInData): Promise<{
  success: boolean
  error?: string
  queuePosition?: number
}> {
  const supabase = createServiceClient()

  // Look up clinic by slug
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id')
    .eq('slug', data.clinicSlug)
    .single()

  if (clinicError || !clinic) {
    return { success: false, error: 'Clinic not found' }
  }

  let patientId: string

  if (data.phone) {
    const formattedPhone = formatPhoneNumber(data.phone)
    if (!isValidUgandaPhone(formattedPhone)) {
      return { success: false, error: 'Invalid phone number. Format: +256 7XX XXX XXX' }
    }

    // Find or create patient by phone
    const { data: existing } = await supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', clinic.id)
      .eq('whatsapp_number', formattedPhone)
      .single()

    if (existing) {
      patientId = existing.id
    } else {
      const { data: newPatient, error: patientError } = await supabase
        .from('patients')
        .insert({
          clinic_id: clinic.id,
          whatsapp_number: formattedPhone,
          first_name: data.name?.split(' ').slice(1).join(' ') || data.name || null,
          last_name: data.name?.split(' ')[0] || null,
        })
        .select('id')
        .single()

      if (patientError || !newPatient) {
        return { success: false, error: 'Failed to create patient record' }
      }
      patientId = newPatient.id
    }
  } else {
    // No phone — create patient with name only
    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: clinic.id,
        whatsapp_number: null,
        display_name: data.name || null,
      })
      .select('id')
      .single()

    if (patientError || !newPatient) {
      return { success: false, error: 'Failed to create patient record' }
    }
    patientId = newPatient.id
  }

  // Check in via RPC (SECURITY DEFINER, creates visit + queue entry)
  const { data: visitId, error: rpcError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: clinic.id,
    p_patient_id: patientId,
    p_chief_complaint: data.reasonForVisit || null,
    p_priority: 'normal',
  })

  if (rpcError) {
    console.error('Check-in RPC failed:', rpcError)
    return { success: false, error: 'Failed to check in. Please ask a clinic assistant for help.' }
  }

  return { success: true }
}

export async function getClinicBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return data
}
