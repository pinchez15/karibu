'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { QueueItem, Patient } from '@karibu/shared'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'

type DuplicateCandidate = {
  id: string
  patient_id: number | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  date_of_birth: string | null
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
  return error?.message || 'Failed to create patient record'
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

export async function fetchQueueData(): Promise<QueueItem[]> {
  // Never trust a client-supplied clinic id — the service-role client
  // bypasses RLS, so the queue is always scoped to the caller's own clinic.
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_clinic_queue', {
    p_clinic_id: staff.clinic_id,
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
  confirm_duplicate?: boolean
}): Promise<{ success?: boolean; error?: string; patient_id?: number; duplicateCandidate?: DuplicateCandidate }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const dobError = validateDateOfBirth(data.date_of_birth)
  if (dobError) return { error: dobError }
  const dateOfBirthIso = parseUgandaDateOfBirth(data.date_of_birth)
  if (!dateOfBirthIso) return { error: 'Enter date of birth as DD-MM-YYYY' }

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
        date_of_birth: dateOfBirthIso,
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
    const duplicateCandidate = await findLikelyDuplicatePatient(
      staff.clinic_id,
      data.first_name.trim(),
      data.last_name.trim(),
      dateOfBirthIso,
    )
    if (duplicateCandidate && !data.confirm_duplicate) {
      return { duplicateCandidate }
    }

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
        date_of_birth: dateOfBirthIso,
        sex: data.sex,
        whatsapp_number: formattedPhone,
      })
      .select('id, patient_id')
      .single()

    if (patientError || !newPatient) {
      console.error('Failed to create patient:', patientError)
      return { error: formatPatientWriteError(patientError) }
    }

    patientId = newPatient.id
    numericPatientId = newPatient.patient_id
  }

  // Add to queue via the current check_in_patient RPC signature. Older hosted
  // projects may still have overloaded legacy variants; passing all current
  // named params keeps the client aligned with the dictation-first schema.
  const { error: rpcError } = await supabase.rpc('check_in_patient', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: patientId,
    p_chief_complaint: data.chief_complaint || null,
    p_priority: data.priority || 'normal',
    p_staff_id: staff.id,
    p_department: 'opd',
  })

  if (rpcError) {
    console.error('Failed to add to queue:', rpcError)
    return { error: rpcError.message || 'Failed to add patient to queue' }
  }

  broadcastQueueUpdate(staff.clinic_id).catch(() => {})
  return { success: true, patient_id: numericPatientId || undefined }
}
