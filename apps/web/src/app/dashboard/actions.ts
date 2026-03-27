'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { QueueItem, Patient } from '@karibu/shared'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

async function broadcastQueueUpdate(clinicId: string) {
  const supabase = createServiceClient()
  const channel = supabase.channel(`queue-updates:${clinicId}`)
  await channel.send({
    type: 'broadcast',
    event: 'queue_changed',
    payload: {},
  })
  supabase.removeChannel(channel)
}

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

  broadcastQueueUpdate(staff.clinic_id).catch(() => {})
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

  broadcastQueueUpdate(staff.clinic_id).catch(() => {})
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

  broadcastQueueUpdate(staff.clinic_id).catch(() => {})
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
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .order('last_name')
    .limit(8)

  if (error) {
    console.error('Failed to search patients:', error)
    return []
  }

  return (data || []) as Patient[]
}

export async function addPatientToQueue(data: {
  first_name: string
  last_name: string
  date_of_birth: string
  sex: 'M' | 'F'
  whatsapp_number?: string
  chief_complaint?: string
  priority?: string
  existing_patient_id?: string
}): Promise<{ success?: boolean; error?: string; patient_id?: number }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  let patientId: string
  let numericPatientId: number | null = null

  if (data.existing_patient_id) {
    // Returning patient — use their existing record
    patientId = data.existing_patient_id

    // Update demographics if they've changed
    await supabase
      .from('patients')
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        date_of_birth: data.date_of_birth,
        sex: data.sex,
        ...(data.whatsapp_number ? { whatsapp_number: formatPhoneNumber(data.whatsapp_number) } : {}),
      })
      .eq('id', patientId)

    const { data: existing } = await supabase
      .from('patients')
      .select('patient_id')
      .eq('id', patientId)
      .single()
    numericPatientId = existing?.patient_id || null
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
        .select('id, patient_id')
        .eq('clinic_id', staff.clinic_id)
        .eq('whatsapp_number', formattedPhone)
        .single()

      if (existing) {
        return { error: `A patient with this phone number already exists (#${existing.patient_id})` }
      }
    }

    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: staff.clinic_id,
        first_name: data.first_name,
        last_name: data.last_name,
        date_of_birth: data.date_of_birth,
        sex: data.sex,
        whatsapp_number: formattedPhone,
      })
      .select('id, patient_id')
      .single()

    if (patientError || !newPatient) {
      console.error('Failed to create patient:', patientError)
      return { error: 'Failed to create patient record' }
    }

    patientId = newPatient.id
    numericPatientId = newPatient.patient_id
  }

  // Add to queue via check_in_patient RPC
  // Note: don't pass p_staff_id — PostgREST only matches the 4-param signature
  const { error: rpcError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: patientId,
    p_chief_complaint: data.chief_complaint || null,
    p_priority: data.priority || 'normal',
  })

  if (rpcError) {
    console.error('Failed to add to queue:', rpcError)
    return { error: 'Failed to add patient to queue' }
  }

  broadcastQueueUpdate(staff.clinic_id).catch(() => {})
  return { success: true, patient_id: numericPatientId || undefined }
}
