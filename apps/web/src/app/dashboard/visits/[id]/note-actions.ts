'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

/**
 * Save a clinician's visit note from the web (desktop dictation card or the
 * inline edit affordance). Mirrors the Android save flow:
 *
 *   1. provider_notes.transcript = the clinician's words (typed or transcribed)
 *   2. patient_notes (source='clinician_fallback') = same content as the
 *      receipt-of-record. AI never overwrites this row (composite unique on
 *      visit_id+source from migration 032).
 *   3. visits: documentation_complete=true, status pending→sent (if pending),
 *      ai_structure_status='not_started' so the Inngest poller picks the
 *      visit up within ~60s and structures it in the background.
 *
 * Service-role client bypasses RLS; we explicitly clinic-scope every write.
 * Roles: any clinician role + admin can save. Lab tech / dispenser can't.
 */
export async function saveClinicianNote(
  visitId: string,
  content: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const text = content.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before saving.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const ALLOWED_ROLES = new Set([
    'admin',
    'doctor',
    'nurse',
    'clinical_officer',
    'midwife',
    'nursing_assistant',
  ])
  if (!ALLOWED_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot author clinical notes.' }
  }

  const supabase = createServiceClient()

  // Confirm visit belongs to caller's clinic.
  const { data: visit, error: visitErr } = await supabase
    .from('visits')
    .select('id, clinic_id, status')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (visitErr || !visit) return { success: false, error: 'Visit not found' }

  const now = new Date().toISOString()

  // 1. provider_notes.transcript — clinician's raw words.
  const { error: providerErr } = await supabase
    .from('provider_notes')
    .upsert(
      {
        id: crypto.randomUUID(),
        visit_id: visitId,
        transcript: text,
        status: 'draft',
        updated_at: now,
      },
      { onConflict: 'visit_id' },
    )
  if (providerErr) {
    return { success: false, error: `provider_notes upsert failed: ${providerErr.message}` }
  }

  // 2. patient_notes (clinician_fallback) — receipt-of-record.
  const { error: patientErr } = await supabase
    .from('patient_notes')
    .upsert(
      {
        id: crypto.randomUUID(),
        visit_id: visitId,
        content: text,
        language: 'en',
        status: 'draft',
        source: 'clinician_fallback',
        updated_at: now,
      },
      { onConflict: 'visit_id,source' },
    )
  if (patientErr) {
    return { success: false, error: `patient_notes upsert failed: ${patientErr.message}` }
  }

  // 3. visits: mark documentation complete, advance status pending→sent,
  //    queue AI. Keep AI status independent of clinical status.
  const visitUpdate: Record<string, unknown> = {
    documentation_complete: true,
    documentation_completed_at: now,
    ai_structure_status: 'not_started',
    ai_structure_error: null,
    updated_at: now,
  }
  if (visit.status === 'pending' || visit.status === 'error') {
    visitUpdate.status = 'sent'
    visitUpdate.error_message = null
    visitUpdate.error_at = null
  }
  const { error: vErr } = await supabase
    .from('visits')
    .update(visitUpdate)
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
  if (vErr) {
    return { success: false, error: `visits update failed: ${vErr.message}` }
  }

  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
