'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'

/**
 * Lab actions — all writes via SECURITY DEFINER RPCs (migration 045).
 */

type LabStatus = 'not_ordered' | 'pending' | 'running' | 'done' | 'abnormal'

async function assertLabTech() {
  const staff = await requireStaff()
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    throw new Error('Forbidden: lab_tech role required')
  }
  return staff
}

/**
 * Ownership pre-check: the service-role client bypasses RLS, so confirm the
 * visit belongs to the caller's clinic before passing it to any RPC.
 * Throws when the visit is missing or owned by another clinic.
 */
async function assertVisitInClinic(visitId: string, clinicId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('visits')
    .select('id')
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!data) {
    throw new Error('Visit not found')
  }
}

export async function startLabTest(
  visitId: string,
  testName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_start_lab_test', {
    p_visit_id: visitId,
    p_test_name: testName,
    p_client_op_id: crypto.randomUUID(),
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  return { success: true }
}

export async function recordLabTestResult(
  visitId: string,
  testName: string,
  result: string,
  abnormal: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = result.trim()
  if (trimmed.length < 1) {
    return { success: false, error: 'Result cannot be empty' }
  }

  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_lab_test_result', {
    p_visit_id: visitId,
    p_test_name: testName,
    p_result: trimmed,
    p_abnormal: abnormal,
    p_client_op_id: crypto.randomUUID(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}

export async function startLabRun(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_start_lab', {
    p_visit_id: visitId,
    p_client_op_id: crypto.randomUUID(),
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  return { success: true }
}

export async function recordLabResult(
  visitId: string,
  result: string,
  abnormal: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = result.trim()
  if (trimmed.length < 1) {
    return { success: false, error: 'Result cannot be empty' }
  }

  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_lab_result', {
    p_visit_id: visitId,
    p_result: trimmed,
    p_abnormal: abnormal,
    p_client_op_id: crypto.randomUUID(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}

export async function reopenLabResult(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_reopen_lab', {
    p_visit_id: visitId,
    p_client_op_id: crypto.randomUUID(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
