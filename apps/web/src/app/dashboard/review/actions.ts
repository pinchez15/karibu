'use server'

import { randomBytes } from 'crypto'
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

  // Get visit details for magic link creation
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('patient_id')
    .eq('id', visitId)
    .single()

  if (visitError || !visit) {
    console.error('Failed to fetch visit:', visitError)
    return { error: 'Failed to find visit' }
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

  // Create magic link for patient note access
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 hours

  const { error: linkError } = await supabase
    .from('magic_links')
    .insert({
      patient_id: visit.patient_id,
      visit_id: visitId,
      token,
      expires_at: expiresAt,
    })

  if (linkError) {
    console.error('Failed to create magic link:', linkError)
    return { error: 'Failed to create patient note link' }
  }

  // Update visit status to 'sent'
  const { error: statusError } = await supabase
    .from('visits')
    .update({
      review_status: 'approved',
      reviewed_by: staff.id,
      reviewed_at: now,
      status: 'sent',
    })
    .eq('id', visitId)

  if (statusError) {
    console.error('Failed to update visit status:', statusError)
    return { error: 'Failed to approve visit' }
  }

  // Send WhatsApp message with patient note link (fire-and-forget)
  fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-whatsapp`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify({
        visit_id: visitId,
        magic_link_token: token,
      }),
    }
  ).catch(err => {
    // Non-blocking — WhatsApp send failure shouldn't block approval
    console.error('Failed to send WhatsApp:', err)
  })

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

  // Re-trigger the transcription pipeline
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify({ visit_id: visitId }),
    }
  )

  if (!response.ok) {
    console.error('Failed to trigger reprocessing')
    // Don't return error — the status was already updated, pipeline will retry
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

  const { data: visit } = await supabase
    .from('visits')
    .select('patient_id, clinic_id')
    .eq('id', visitId)
    .single()

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

  return { success: true, receipt_number: payment.receipt_number }
}

export async function skipPayment(visitId: string): Promise<{ success?: boolean; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()

  await supabase
    .from('visits')
    .update({ status: 'completed' })
    .eq('id', visitId)

  return { success: true }
}
