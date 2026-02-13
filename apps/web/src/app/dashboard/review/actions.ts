'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

export async function approveVisit(
  visitId: string,
  providerNoteId: string | null,
  editedSoapNote: string | null,
) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  // Save any edited notes first
  if (providerNoteId && editedSoapNote !== null) {
    const { error: noteError } = await supabase
      .from('provider_notes')
      .update({ note_content: editedSoapNote })
      .eq('id', providerNoteId)
    if (noteError) {
      console.error('Failed to update provider note:', noteError)
      return { error: 'Failed to save note edits' }
    }
  }

  // Update visit review status
  const { error } = await supabase
    .from('visits')
    .update({
      review_status: 'approved',
      reviewed_by: staff.id,
      reviewed_at: new Date().toISOString(),
      status: 'review',
    })
    .eq('id', visitId)

  if (error) {
    console.error('Failed to approve visit:', error)
    return { error: 'Failed to approve visit' }
  }

  // Finalize notes
  const now = new Date().toISOString()
  await Promise.all([
    supabase
      .from('provider_notes')
      .update({ status: 'finalized', finalized_at: now, finalized_by: staff.id })
      .eq('visit_id', visitId),
    supabase
      .from('patient_notes')
      .update({ status: 'finalized' })
      .eq('visit_id', visitId),
  ])

  return { success: true }
}

export async function rejectVisit(visitId: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('visits')
    .update({
      review_status: 'rejected',
      reviewed_by: staff.id,
      reviewed_at: new Date().toISOString(),
      status: 'processing',
    })
    .eq('id', visitId)

  if (error) {
    console.error('Failed to reject visit:', error)
    return { error: 'Failed to reject visit' }
  }

  return { success: true }
}

export async function saveProviderNoteEdit(providerNoteId: string, noteContent: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('provider_notes')
    .update({ note_content: noteContent })
    .eq('id', providerNoteId)

  if (error) {
    console.error('Failed to save note:', error)
    return { error: 'Failed to save note' }
  }

  return { success: true }
}
