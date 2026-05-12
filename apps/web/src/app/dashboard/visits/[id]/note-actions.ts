'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

// Senior clinicians who can sign / amend a note (matches the role gate baked
// into rpc_sign_provider_note + rpc_amend_provider_note in migration 039).
const SIGNING_ROLES = new Set(['admin', 'doctor', 'clinical_officer', 'midwife'])

// Roles allowed to void a signed note (matches rpc_void_provider_note).
const VOIDING_ROLES = new Set(['admin', 'doctor', 'clinical_officer'])

async function loadVisitForStaff(
  visitId: string,
  clinicId: string,
): Promise<{
  id: string
  patient_id: string
  clinic_id: string
  status: string
} | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('visits')
    .select('id, patient_id, clinic_id, status')
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  return data as
    | { id: string; patient_id: string; clinic_id: string; status: string }
    | null
}

/**
 * Phase 2 autosave: persist the in-progress dictation as a `draft` provider
 * note keyed on `noteId`. Does NOT touch patient_notes, visits, or
 * ai_review_status — Sign owns those side effects. Safe to call on every
 * keystroke (debounced client-side).
 *
 * `noteId` is the stable UUID the editor generates on mount; the server
 * upserts on conflict so repeated autosaves of the same draft just update
 * the same row.
 */
export async function autosaveDraftNote(input: {
  note_id: string
  visit_id: string
  transcript: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, visit_id, transcript } = input

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot author clinical notes.' }
  }

  const visit = await loadVisitForStaff(visit_id, staff.clinic_id)
  if (!visit) return { success: false, error: 'Visit not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_upsert_provider_note', {
    p_id: note_id,
    p_visit_id: visit_id,
    p_transcript: transcript,
    p_status: 'draft',
    p_patient_id: visit.patient_id,
    p_source: 'visit',
  })
  if (rpcErr) {
    return {
      success: false,
      error: `autosave failed: ${rpcErr.message}`,
    }
  }
  return { success: true }
}

/**
 * Sign a clinician's visit note. This is the Phase 2 successor to the old
 * overloaded "Save" — it now represents the explicit attestation:
 *
 *   1. provider_notes upsert via rpc_upsert_provider_note with status='signed'
 *      (drives finalized_at/by via the RPC's senior-role gate).
 *   2. patient_notes (source='clinician_fallback') = receipt-of-record.
 *      AI never overwrites this row (composite unique on visit_id+source).
 *   3. visits: documentation_complete=true, status pending→sent (if pending),
 *      ai_review_status='not_started' so the Inngest poller picks the
 *      visit up within ~60s and structures it in the background.
 *
 * Service-role client bypasses RLS; we explicitly clinic-scope every write.
 * Roles: senior clinicians (admin/doctor/clinical_officer/midwife) sign.
 * The other clinical roles (nurse, nursing_assistant) can author drafts but
 * not sign.
 */
export async function signClinicianNote(
  visitId: string,
  content: string,
  noteId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const text = content.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before signing.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  if (!SIGNING_ROLES.has(staff.role)) {
    return {
      success: false,
      error: 'Your role cannot sign clinical notes.',
    }
  }

  const supabase = createServiceClient()

  // Confirm visit belongs to caller's clinic and grab the patient id.
  const visit = await loadVisitForStaff(visitId, staff.clinic_id)
  if (!visit) return { success: false, error: 'Visit not found' }

  const now = new Date().toISOString()

  // 1. provider_notes — upsert + sign in one RPC round-trip.
  const { error: providerErr } = await supabase.rpc('rpc_upsert_provider_note', {
    p_id: noteId ?? crypto.randomUUID(),
    p_visit_id: visitId,
    p_transcript: text,
    p_status: 'signed',
    p_patient_id: visit.patient_id,
    p_source: 'visit',
  })
  if (providerErr) {
    return {
      success: false,
      error: `provider_notes upsert failed: ${providerErr.message}`,
    }
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
  //    queue the AI review. Keep AI lifecycle independent of clinical
  //    status — the cashier never waits on AI.
  const visitUpdate: Record<string, unknown> = {
    documentation_complete: true,
    documentation_completed_at: now,
    ai_review_status: 'not_started',
    ai_review_error: null,
    ai_review_no_concerns: false,
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

/**
 * Back-compat alias. Anything still importing `saveClinicianNote` keeps
 * working; semantically this is Sign now.
 */
export const saveClinicianNote = signClinicianNote

/**
 * Amend a previously-signed note. Transcript content is rewritten; status
 * becomes 'amended'. RPC enforces senior role + signed/amended precondition.
 */
export async function amendClinicianNote(input: {
  note_id: string
  transcript: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, transcript } = input
  const text = transcript.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before amending.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!SIGNING_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot amend clinical notes.' }
  }

  const supabase = createServiceClient()

  // Confirm the note exists in caller's clinic via the patient FK. Provides
  // a friendlier error than letting the RPC throw "Note not found".
  const { data: note } = await supabase
    .from('provider_notes')
    .select('id, visit_id, patient_id, patients!inner(clinic_id)')
    .eq('id', note_id)
    .maybeSingle()
  type NoteRow = {
    id: string
    visit_id: string | null
    patient_id: string
    patients: { clinic_id: string } | { clinic_id: string }[] | null
  }
  const patientsField = (note as NoteRow | null)?.patients
  const noteClinicId = Array.isArray(patientsField)
    ? patientsField[0]?.clinic_id
    : patientsField?.clinic_id
  if (!note || noteClinicId !== staff.clinic_id) {
    return { success: false, error: 'Note not found' }
  }

  const { error: rpcErr } = await supabase.rpc('rpc_amend_provider_note', {
    p_id: note_id,
    p_transcript: text,
  })
  if (rpcErr) {
    return { success: false, error: `amend failed: ${rpcErr.message}` }
  }

  const visitId = (note as NoteRow).visit_id
  if (visitId) revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}

/**
 * Void a signed/amended note. Requires a non-empty reason. Status becomes
 * 'voided' and remains in the audit trail. Senior-only (admin / doctor /
 * clinical_officer).
 */
export async function voidClinicianNote(input: {
  note_id: string
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, reason } = input
  const trimmedReason = reason.trim()
  if (trimmedReason.length === 0) {
    return { success: false, error: 'Provide a reason for voiding the note.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!VOIDING_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot void clinical notes.' }
  }

  const supabase = createServiceClient()

  const { data: note } = await supabase
    .from('provider_notes')
    .select('id, visit_id, patient_id, patients!inner(clinic_id)')
    .eq('id', note_id)
    .maybeSingle()
  type NoteRow = {
    id: string
    visit_id: string | null
    patient_id: string
    patients: { clinic_id: string } | { clinic_id: string }[] | null
  }
  const patientsField = (note as NoteRow | null)?.patients
  const noteClinicId = Array.isArray(patientsField)
    ? patientsField[0]?.clinic_id
    : patientsField?.clinic_id
  if (!note || noteClinicId !== staff.clinic_id) {
    return { success: false, error: 'Note not found' }
  }

  const { error: rpcErr } = await supabase.rpc('rpc_void_provider_note', {
    p_id: note_id,
    p_reason: trimmedReason,
  })
  if (rpcErr) {
    return { success: false, error: `void failed: ${rpcErr.message}` }
  }

  const visitId = (note as NoteRow).visit_id
  if (visitId) revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
