'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { inngest } from '@/inngest/client'

/**
 * Manually re-trigger AI structuring for a visit. Reachable from the
 * visit-details "Retry AI structuring" button. Re-fires the same
 * `note.dictated` event the scheduled poller uses; structureDictation's
 * concurrency=1 collapses duplicates.
 */
export async function retryAiStructure(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const supabase = createServiceClient()

  // Confirm visit exists in caller's clinic + has a transcript to structure.
  // Without a transcript the function would NonRetriableError — surface it
  // to the user up front instead.
  const { data: visit, error } = await supabase
    .from('visits')
    .select('id, clinic_id, documentation_complete, provider_notes(transcript)')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (error || !visit) {
    return { success: false, error: 'Visit not found' }
  }
  if (!visit.documentation_complete) {
    return { success: false, error: 'Visit not yet documented' }
  }

  const rawNote = visit.provider_notes as unknown
  const note = Array.isArray(rawNote)
    ? (rawNote[0] as { transcript?: string | null } | undefined)
    : (rawNote as { transcript?: string | null } | null)
  if (!note?.transcript || note.transcript.trim().length === 0) {
    return { success: false, error: 'No transcript on this visit' }
  }

  // Reset state so structureDictation runs cleanly.
  const { error: resetErr } = await supabase
    .from('visits')
    .update({
      ai_structure_status: 'pending',
      ai_structure_error: null,
    })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
  if (resetErr) {
    return { success: false, error: resetErr.message }
  }

  // Fire the event. Concurrency=1 on structureDictation collapses duplicates.
  await inngest.send({
    name: 'note.dictated',
    data: { visit_id: visitId, clinic_id: staff.clinic_id },
  })

  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
