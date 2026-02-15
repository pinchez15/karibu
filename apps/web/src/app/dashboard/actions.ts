'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { QueueItem } from '@karibu/shared'

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
