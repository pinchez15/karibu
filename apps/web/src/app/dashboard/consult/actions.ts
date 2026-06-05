'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { buildConsultSnapshot, type ConsultRedactorInput } from '@/lib/consult-redactor'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

export async function startConsultForVisit(
  visitId: string,
): Promise<
  | { success: true; threadId: string; readOnly: boolean }
  | { success: false; error: string }
> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot start consult' }
  }

  const supabase = createServiceClient()
  const { data: visit, error: visitErr } = await supabase
    .from('visits')
    .select(`
      id,
      clinic_id,
      patient_id,
      documentation_complete,
      chief_complaint,
      diagnosis,
      tests_ordered,
      lab_results,
      medications,
      patient:patients(date_of_birth, sex),
      provider_notes(transcript)
    `)
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (visitErr || !visit) return { success: false, error: 'Visit not found' }

  const patient = Array.isArray(visit.patient) ? visit.patient[0] : visit.patient
  const note = Array.isArray(visit.provider_notes)
    ? visit.provider_notes[0]
    : visit.provider_notes

  const redactorInput: ConsultRedactorInput = {
    dateOfBirth: (patient as { date_of_birth?: string } | null)?.date_of_birth ?? null,
    sex: (patient as { sex?: string } | null)?.sex ?? null,
    chiefComplaint: visit.chief_complaint as string | null,
    diagnosis: visit.diagnosis as string | null,
    testsOrdered: visit.tests_ordered as string | null,
    labResults: visit.lab_results as string | null,
    medications: visit.medications as string | null,
    providerTranscript: (note as { transcript?: string } | null)?.transcript ?? null,
  }

  const snapshot = buildConsultSnapshot(redactorInput)

  const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_start_consult', {
    p_visit_id: visitId,
    p_redacted_snapshot: snapshot,
  })

  if (rpcErr || !rpcData) {
    return { success: false, error: rpcErr?.message ?? 'Could not start consult' }
  }

  const payload = rpcData as { thread_id?: string; read_only?: boolean }
  const threadId = payload.thread_id
  if (!threadId) {
    return { success: false, error: 'Could not start consult (missing thread_id)' }
  }

  revalidatePath('/dashboard/consult')
  revalidatePath(`/dashboard/consult/${threadId}`)
  revalidatePath(`/dashboard/visits/${visitId}`)

  return {
    success: true,
    threadId,
    readOnly: payload.read_only === true,
  }
}
