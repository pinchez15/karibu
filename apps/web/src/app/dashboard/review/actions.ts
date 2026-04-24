'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

// Service-role client bypasses RLS, so every mutation in this file scopes by
// staff.clinic_id. Without it, any authenticated clinician at clinic A can
// mutate any visit/note/payment at clinic B by guessing UUIDs.
async function loadVisitForStaff(
  supabase: SupabaseClient,
  visitId: string,
  clinicId: string,
): Promise<{ id: string; patient_id: string; clinic_id: string } | null> {
  const { data } = await supabase
    .from('visits')
    .select('id, patient_id, clinic_id')
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()
  return data as { id: string; patient_id: string; clinic_id: string } | null
}

export async function approveVisit(
  visitId: string,
  providerNoteId: string | null,
  editedSoapNote: string | null,
) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const visit = await loadVisitForStaff(supabase, visitId, staff.clinic_id)
  if (!visit) return { error: 'Visit not found' }

  // Save any edited notes first
  if (providerNoteId && editedSoapNote !== null) {
    const { error: noteError } = await supabase
      .from('provider_notes')
      .update({ note_content: editedSoapNote })
      .eq('id', providerNoteId)
      .eq('visit_id', visitId)
    if (noteError) {
      console.error('Failed to update provider note:', noteError)
      return { error: 'Failed to save note edits' }
    }
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

  // Mark visit as approved and ready to print
  const { error: statusError } = await supabase
    .from('visits')
    .update({
      review_status: 'approved',
      reviewed_by: staff.id,
      reviewed_at: now,
      status: 'sent',
    })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (statusError) {
    console.error('Failed to update visit status:', statusError)
    return { error: 'Failed to approve visit' }
  }

  return { success: true, printUrl: `/dashboard/visits/${visitId}/print` }
}

export async function rejectVisit(visitId: string, reason?: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const visit = await loadVisitForStaff(supabase, visitId, staff.clinic_id)
  if (!visit) return { error: 'Visit not found' }

  // Reject = AI output wasn't right. Clear the AI artifacts (SOAP note,
  // structured data, patient summary, flattened clinical fields) and send
  // the visit back to 'pending' so the clinician can re-dictate. Keep the
  // raw transcript so they can edit it on the dictation screen instead of
  // re-speaking everything.
  const now = new Date().toISOString()
  const [providerErr, patientErr] = await Promise.all([
    supabase
      .from('provider_notes')
      .update({ note_content: null, structured_data: null, updated_at: now })
      .eq('visit_id', visitId)
      .then(r => r.error),
    supabase
      .from('patient_notes')
      .update({ content: null, updated_at: now })
      .eq('visit_id', visitId)
      .then(r => r.error),
  ])
  if (providerErr || patientErr) {
    console.error('Failed to clear AI output:', providerErr ?? patientErr)
    return { error: 'Failed to clear AI output' }
  }

  const { error: visitErr } = await supabase
    .from('visits')
    .update({
      status: 'pending',
      review_status: 'rejected',
      reviewed_by: staff.id,
      reviewed_at: now,
      diagnosis: null,
      medications: null,
      tests_ordered: null,
      follow_up_instructions: null,
      updated_at: now,
    })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (visitErr) {
    console.error('Failed to reject visit:', visitErr)
    return { error: 'Failed to reject visit' }
  }

  // Audit logging is handled by the reject-dictation edge function when called
  // from Android; from the web we lean on Supabase audit_logs being written
  // by triggers / the existing audit pipeline. (Optional follow-up: hit the
  // edge function from here for unified audit, or invoke auditLog directly.)
  void reason

  return { success: true }
}

export async function saveProviderNoteEdit(providerNoteId: string, noteContent: string) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  // Walk the FK to confirm this provider_note belongs to staff's clinic before editing.
  const { data: note } = await supabase
    .from('provider_notes')
    .select('id, visit:visits!inner(clinic_id)')
    .eq('id', providerNoteId)
    .single()

  type NoteRow = { id: string; visit: { clinic_id: string } | { clinic_id: string }[] | null }
  const visitField = (note as NoteRow | null)?.visit
  const noteClinicId = Array.isArray(visitField) ? visitField[0]?.clinic_id : visitField?.clinic_id
  if (!note || noteClinicId !== staff.clinic_id) return { error: 'Note not found' }

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

export async function recordPayment(
  visitId: string,
  data: {
    amount_ugx: number
    payment_method: string
    service_type?: string
    notes?: string
    waived?: boolean
  }
): Promise<{ success?: boolean; receipt_number?: string; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const visit = await loadVisitForStaff(supabase, visitId, staff.clinic_id)
  if (!visit) return { error: 'Visit not found' }

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      visit_id: visitId,
      clinic_id: visit.clinic_id,
      patient_id: visit.patient_id,
      amount_ugx: data.waived ? 0 : data.amount_ugx,
      payment_method: data.payment_method,
      status: data.waived ? 'waived' : 'paid',
      service_type: data.service_type || null,
      notes: data.notes || null,
      collected_by: staff.id,
    })
    .select('receipt_number')
    .single()

  if (error) {
    console.error('Failed to record payment:', error)
    return { error: 'Failed to record payment' }
  }

  await supabase
    .from('visits')
    .update({ status: 'completed' })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  return { success: true, receipt_number: payment.receipt_number }
}

export async function skipPayment(visitId: string): Promise<{ success?: boolean; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  const visit = await loadVisitForStaff(supabase, visitId, staff.clinic_id)
  if (!visit) return { error: 'Visit not found' }

  await supabase
    .from('visits')
    .update({ status: 'completed' })
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  return { success: true }
}
