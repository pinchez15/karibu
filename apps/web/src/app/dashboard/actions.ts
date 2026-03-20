'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { QueueItem, Patient } from '@karibu/shared'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

export async function fetchQueueData(clinicId: string): Promise<QueueItem[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_clinic_queue', {
    p_clinic_id: clinicId,
  })

  if (error) {
    console.error('Failed to fetch queue:', error)
    return []
  }

  return (data || []) as QueueItem[]
}

export async function assignToNurse(visitId: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('assign_to_nurse', {
    p_visit_id: visitId,
    p_nurse_id: staff.id,
  })

  if (error) {
    console.error('Failed to assign to nurse:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function markReadyForDoctor(visitId: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('mark_ready_for_doctor', {
    p_visit_id: visitId,
    p_staff_id: staff.id,
  })

  if (error) {
    console.error('Failed to mark ready for doctor:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function claimPatient(visitId: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('claim_patient', {
    p_visit_id: visitId,
    p_doctor_id: staff.id,
  })

  if (error) {
    console.error('Failed to claim patient:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function searchPatients(query: string): Promise<Patient[]> {
  const staff = await getStaff()
  if (!staff || query.length < 2) return []

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', staff.clinic_id)
    .ilike('display_name', `%${query}%`)
    .order('display_name')
    .limit(8)

  if (error) {
    console.error('Failed to search patients:', error)
    return []
  }

  return (data || []) as Patient[]
}

export async function addPatientToQueue(data: {
  display_name: string
  date_of_birth: string
  sex: 'M' | 'F'
  whatsapp_number?: string
  chief_complaint?: string
  priority?: string
  existing_patient_id?: string
}): Promise<{ success?: boolean; error?: string; patient_number?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  let patientId: string
  let patientNumber: string | null = null

  if (data.existing_patient_id) {
    // Returning patient — use their existing record
    patientId = data.existing_patient_id

    // Update demographics if they've changed
    await supabase
      .from('patients')
      .update({
        display_name: data.display_name,
        date_of_birth: data.date_of_birth,
        sex: data.sex,
        ...(data.whatsapp_number ? { whatsapp_number: formatPhoneNumber(data.whatsapp_number) } : {}),
      })
      .eq('id', patientId)

    const { data: existing } = await supabase
      .from('patients')
      .select('patient_number')
      .eq('id', patientId)
      .single()
    patientNumber = existing?.patient_number || null
  } else {
    // New patient
    let formattedPhone: string | null = null
    if (data.whatsapp_number) {
      formattedPhone = formatPhoneNumber(data.whatsapp_number)
      if (!isValidUgandaPhone(formattedPhone)) {
        return { error: 'Invalid phone number format. Use +256 7XX XXX XXX' }
      }

      // Check for duplicate phone at this clinic
      const { data: existing } = await supabase
        .from('patients')
        .select('id, patient_number')
        .eq('clinic_id', staff.clinic_id)
        .eq('whatsapp_number', formattedPhone)
        .single()

      if (existing) {
        return { error: `A patient with this phone number already exists (${existing.patient_number})` }
      }
    }

    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: staff.clinic_id,
        display_name: data.display_name,
        date_of_birth: data.date_of_birth,
        sex: data.sex,
        whatsapp_number: formattedPhone,
      })
      .select('id, patient_number')
      .single()

    if (patientError || !newPatient) {
      console.error('Failed to create patient:', patientError)
      return { error: 'Failed to create patient record' }
    }

    patientId = newPatient.id
    patientNumber = newPatient.patient_number
  }

  // Add to queue via check_in_patient RPC
  const { error: rpcError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: patientId,
    p_chief_complaint: data.chief_complaint || null,
    p_priority: data.priority || 'normal',
    p_staff_id: staff.id,
  })

  if (rpcError) {
    console.error('Failed to add to queue:', rpcError)
    return { error: 'Failed to add patient to queue' }
  }

  return { success: true, patient_number: patientNumber || undefined }
}
