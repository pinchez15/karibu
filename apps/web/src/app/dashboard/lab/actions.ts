'use server'

import { revalidatePath } from 'next/cache'
import { inngest } from '@/inngest/client'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'
import { broadcastClinicRefresh } from '@/lib/realtime-server'

async function revalidateLabPaths(visitId: string, clinicId: string) {
  revalidatePath('/dashboard/lab')
  revalidatePath('/dashboard/lab/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  revalidatePath('/dashboard/worklists')
  revalidatePath('/dashboard/opd')
  // Android-origin lab writes go through the same RPCs; web clients pick up
  // changes via this broadcast. Offline Android stations rely on the 60s poll.
  void broadcastClinicRefresh(clinicId)
}

async function assertLabTech() {
  const staff = await requireStaff()
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    throw new Error('Forbidden: lab_tech role required')
  }
  return staff
}

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

async function queueLabAiAssist(visitId: string, clinicId: string): Promise<void> {
  const supabase = createServiceClient()
  const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_request_lab_ai_assist', {
    p_visit_id: visitId,
  })
  if (rpcErr) {
    console.warn('queueLabAiAssist rpc failed:', rpcErr.message)
    return
  }

  const queued = (rpcData as { queued?: boolean })?.queued === true
  if (!queued) return

  if (process.env.NODE_ENV === 'production' && !process.env.INNGEST_EVENT_KEY) {
    console.error(
      'queueLabAiAssist: INNGEST_EVENT_KEY is not set in production — lab AI notes will NOT be dispatched.',
    )
  }

  try {
    await inngest.send({
      name: 'note.lab-ai-assist',
      data: {
        visit_id: visitId,
        clinic_id: clinicId,
        phase: 'lab',
      },
    })
  } catch (err) {
    console.error('queueLabAiAssist: inngest.send failed for visit', visitId, err)
  }
}

export async function startLabTest(
  visitId: string,
  testName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertLabTech()
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
  await revalidateLabPaths(visitId, staff.clinic_id)
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

  let clinicId: string
  try {
    const staff = await assertLabTech()
    await assertVisitInClinic(visitId, staff.clinic_id)
    clinicId = staff.clinic_id
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

  void queueLabAiAssist(visitId, clinicId)
  await revalidateLabPaths(visitId, clinicId)
  return { success: true }
}

export async function startLabRun(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertLabTech()
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
  await revalidateLabPaths(visitId, staff.clinic_id)
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

  let staff
  try {
    staff = await assertLabTech()
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
  await revalidateLabPaths(visitId, staff.clinic_id)
  return { success: true }
}

export async function reopenLabResult(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertLabTech()
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
  await revalidateLabPaths(visitId, staff.clinic_id)
  return { success: true }
}
