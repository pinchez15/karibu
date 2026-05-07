'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'

/**
 * Lab MVP actions.
 *
 * Free-text results stored on `visits.lab_results`. The lab tech can flag
 * the result as abnormal, which sets `visits.lab_abnormal=true` so the
 * ordering clinician's "needs attention" view can pick it up.
 */

type LabStatus = 'not_ordered' | 'pending' | 'running' | 'done' | 'abnormal'

async function assertLabTech() {
  const staff = await requireStaff()
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    throw new Error('Forbidden: lab_tech role required')
  }
  return staff
}

/** Mark a visit as "running" so the lab tech can claim it from the queue. */
export async function startLabRun(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertLabTech()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('visits')
    .update({ lab_status: 'running' })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .eq('lab_status', 'pending')
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  return { success: true }
}

/**
 * Save the lab result (free text). When `abnormal=true` the visit also
 * gets `lab_abnormal=true` for clinician notification, otherwise the flag
 * is cleared so re-saving with a corrected value works as expected.
 */
export async function recordLabResult(
  visitId: string,
  result: string,
  abnormal: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = result.trim()
  if (trimmed.length < 1) {
    return { success: false, error: 'Result cannot be empty' }
  }

  let staff
  try {
    staff = await assertLabTech()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const status: LabStatus = abnormal ? 'abnormal' : 'done'

  const { error } = await supabase
    .from('visits')
    .update({
      lab_status: status,
      lab_results: trimmed,
      lab_abnormal: abnormal,
      lab_completed_at: new Date().toISOString(),
      lab_completed_by: staff.id,
    })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}

export async function reopenLabResult(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertLabTech()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('visits')
    .update({
      lab_status: 'pending',
      lab_results: null,
      lab_abnormal: false,
      lab_completed_at: null,
      lab_completed_by: null,
    })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
