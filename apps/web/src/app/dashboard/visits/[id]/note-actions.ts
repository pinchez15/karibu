'use server'

import { revalidatePath } from 'next/cache'
import { inngest } from '@/inngest/client'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import {
  type ClinicalNoteSections,
  sectionsToClinicianText,
} from '@/lib/clinical-note-sections'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

// Senior clinicians who can sign / amend / cosign a note (matches the role
// gates baked into rpc_sign_provider_note + rpc_amend_provider_note +
// rpc_cosign_provider_note in migrations 039 / 044).
const SIGNING_ROLES = new Set(['admin', 'doctor', 'clinical_officer', 'midwife'])
const COSIGN_ROLES = SIGNING_ROLES

// Roles allowed to void a signed note (matches rpc_void_provider_note).
const VOIDING_ROLES = new Set(['admin', 'doctor', 'clinical_officer'])

// Anyone clinical can addend (matches rpc_addend_provider_note, migration 044).
const ADDEND_ROLES = new Set([
  'admin',
  'doctor',
  'clinical_officer',
  'midwife',
  'nurse',
  'nursing_assistant',
])

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

async function syncVisitClinicalSummary(
  visitId: string,
  sections: ClinicalNoteSections,
): Promise<{ success: true } | { success: false; error: string }> {
  const followUpTasks = sections.followUpTasks.filter(Boolean).join('; ')
  const followUp = [sections.followUpInstructions.trim(), followUpTasks]
    .filter(Boolean)
    .join('\n')

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_upsert_visit_clinical_summary', {
    p_visit_id: visitId,
    p_diagnosis: sections.diagnosis.trim() || null,
    p_medications: sections.medications.trim() || null,
    p_follow_up_instructions: followUp || null,
    p_tests_ordered: sections.testsOrdered.trim() || null,
    p_structured_data: JSON.stringify(sections),
  })
  if (error) {
    return { success: false, error: `clinical summary failed: ${error.message}` }
  }
  return { success: true }
}

/**
 * Phase 2 autosave: persist the in-progress dictation as a `draft` provider
 * note keyed on `noteId`. Also syncs structured fields to the visit so lab
 * pharmacy queues can advance before Sign (EHR pivot).
 *
 * Does NOT set documentation_complete or sign the note — use Sign for that.
 */
export async function autosaveDraftNote(input: {
  note_id: string
  visit_id: string
  transcript: string
  sections: ClinicalNoteSections
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, visit_id, transcript, sections } = input

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

  const summary = await syncVisitClinicalSummary(visit_id, sections)
  if (!summary.success) return summary

  return { success: true }
}

/**
 * Best-effort draft-stage AI assist after autosave. Records intent via RPC and
 * dispatches Inngest — failures must not block the clinician's typing flow.
 */
export async function queueDraftAiAssist(input: {
  visit_id: string
  sections: ClinicalNoteSections
}): Promise<void> {
  const staff = await getStaff()
  if (!staff) return
  if (!CLINICAL_ROLES.has(staff.role)) return

  const visit = await loadVisitForStaff(input.visit_id, staff.clinic_id)
  if (!visit) return

  const transcript = sectionsToClinicianText(input.sections)
  if (transcript.trim().length < 50) return

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_request_draft_ai_assist', {
    p_visit_id: input.visit_id,
    p_sections_snapshot: input.sections,
  })
  if (rpcErr) {
    console.warn('queueDraftAiAssist rpc failed:', rpcErr.message)
    return
  }

  try {
    await inngest.send({
      name: 'note.draft-ai-assist',
      data: {
        visit_id: input.visit_id,
        clinic_id: visit.clinic_id,
        phase: 'draft',
      },
    })
  } catch (err) {
    console.warn('queueDraftAiAssist inngest failed:', err)
  }
}

/** Explicit save — same persistence as autosave, with path revalidation. */
export async function saveDraftNote(input: {
  note_id: string
  visit_id: string
  sections: ClinicalNoteSections
}): Promise<{ success: true } | { success: false; error: string }> {
  const transcript = sectionsToClinicianText(input.sections)
  const result = await autosaveDraftNote({
    note_id: input.note_id,
    visit_id: input.visit_id,
    transcript,
    sections: input.sections,
  })
  if (result.success) {
    revalidatePath(`/dashboard/visits/${input.visit_id}`)
  }
  return result
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
  sections?: ClinicalNoteSections,
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

  if (sections) {
    const summary = await syncVisitClinicalSummary(visitId, sections)
    if (!summary.success) return summary
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
 * Atomic finalize via rpc_finalize_clinical_encounter — sign + patient receipt +
 * visit clinical summary in one SECURITY DEFINER RPC (migration 048). Optional
 * parallel to signClinicianNote for clients that prefer a single round-trip.
 */
export async function finalizeClinicalEncounter(input: {
  note_id: string
  visit_id: string
  transcript: string
  patient_summary: string
  sections?: ClinicalNoteSections
  client_op_id?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const text = input.transcript.trim()
  const summary = input.patient_summary.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before finalizing.' }
  }
  if (summary.length < 10) {
    return { success: false, error: 'Patient summary is too short.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot finalize clinical encounters.' }
  }

  const visit = await loadVisitForStaff(input.visit_id, staff.clinic_id)
  if (!visit) return { success: false, error: 'Visit not found' }

  let diagnosis: string | null = null
  let medications: string | null = null
  let followUp: string | null = null
  let testsOrdered: string | null = null
  let structuredData: string | null = null

  if (input.sections) {
    const followUpTasks = input.sections.followUpTasks.filter(Boolean).join('; ')
    followUp = [input.sections.followUpInstructions.trim(), followUpTasks]
      .filter(Boolean)
      .join('\n')
    diagnosis = input.sections.diagnosis.trim() || null
    medications = input.sections.medications.trim() || null
    testsOrdered = input.sections.testsOrdered.trim() || null
    structuredData = JSON.stringify(input.sections)
  }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_finalize_clinical_encounter', {
    p_note_id: input.note_id,
    p_visit_id: input.visit_id,
    p_patient_id: visit.patient_id,
    p_transcript: text,
    p_patient_summary: summary,
    p_diagnosis: diagnosis,
    p_medications: medications,
    p_follow_up_instructions: followUp,
    p_tests_ordered: testsOrdered,
    p_structured_data: structuredData,
    p_client_op_id: input.client_op_id ?? null,
  })
  if (rpcErr) {
    return { success: false, error: `finalize failed: ${rpcErr.message}` }
  }

  revalidatePath(`/dashboard/visits/${input.visit_id}`)
  return { success: true }
}

type NoteRow = {
  id: string
  visit_id: string | null
  patient_id: string
  patients: { clinic_id: string } | { clinic_id: string }[] | null
}

async function loadNoteForStaff(noteId: string, clinicId: string): Promise<NoteRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('provider_notes')
    .select('id, visit_id, patient_id, patients!inner(clinic_id)')
    .eq('id', noteId)
    .maybeSingle()
  const note = data as NoteRow | null
  const patientsField = note?.patients
  const noteClinicId = Array.isArray(patientsField)
    ? patientsField[0]?.clinic_id
    : patientsField?.clinic_id
  return note && noteClinicId === clinicId ? note : null
}

/**
 * Amend a previously-signed note. Transcript content is rewritten; status
 * becomes 'amended'. RPC (migration 044) requires a reason and snapshots the
 * prior content into provider_note_amendments before mutating.
 */
export async function amendClinicianNote(input: {
  note_id: string
  transcript: string
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const { note_id, transcript, reason } = input
  const text = transcript.trim()
  const trimmedReason = reason.trim()
  if (text.length < 10) {
    return { success: false, error: 'Add a bit more to the note before amending.' }
  }
  if (trimmedReason.length === 0) {
    return { success: false, error: 'Provide a reason for the amendment.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!SIGNING_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot amend clinical notes.' }
  }

  const note = await loadNoteForStaff(note_id, staff.clinic_id)
  if (!note) return { success: false, error: 'Note not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_amend_provider_note', {
    p_id: note_id,
    p_transcript: text,
    p_reason: trimmedReason,
  })
  if (rpcErr) {
    return { success: false, error: `amend failed: ${rpcErr.message}` }
  }

  if (note.visit_id) revalidatePath(`/dashboard/visits/${note.visit_id}`)
  return { success: true }
}

/**
 * Cosign a mid-level provider's signed note. Sets status='cosigned' and
 * clears requires_cosign. RPC enforces (a) caller is attending-level and
 * (b) caller is not the original author.
 */
export async function cosignClinicianNote(input: {
  note_id: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!COSIGN_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot cosign clinical notes.' }
  }

  const note = await loadNoteForStaff(input.note_id, staff.clinic_id)
  if (!note) return { success: false, error: 'Note not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_cosign_provider_note', {
    p_id: input.note_id,
  })
  if (rpcErr) {
    return { success: false, error: `cosign failed: ${rpcErr.message}` }
  }

  if (note.visit_id) revalidatePath(`/dashboard/visits/${note.visit_id}`)
  return { success: true }
}

/**
 * Append an addendum to a signed note. The original content is preserved on
 * provider_notes; each addendum is a row in provider_note_addendums. Status
 * flips to 'addended' unless the parent was already cosigned/amended.
 */
export async function addendClinicianNote(input: {
  note_id: string
  addendum_text: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const text = input.addendum_text.trim()
  if (text.length < 3) {
    return { success: false, error: 'Addendum is too short.' }
  }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!ADDEND_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot addend clinical notes.' }
  }

  const note = await loadNoteForStaff(input.note_id, staff.clinic_id)
  if (!note) return { success: false, error: 'Note not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_addend_provider_note', {
    p_id: input.note_id,
    p_addendum_text: text,
  })
  if (rpcErr) {
    return { success: false, error: `addend failed: ${rpcErr.message}` }
  }

  if (note.visit_id) revalidatePath(`/dashboard/visits/${note.visit_id}`)
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

  const note = await loadNoteForStaff(note_id, staff.clinic_id)
  if (!note) return { success: false, error: 'Note not found' }

  const supabase = createServiceClient()
  const { error: rpcErr } = await supabase.rpc('rpc_void_provider_note', {
    p_id: note_id,
    p_reason: trimmedReason,
  })
  if (rpcErr) {
    return { success: false, error: `void failed: ${rpcErr.message}` }
  }

  if (note.visit_id) revalidatePath(`/dashboard/visits/${note.visit_id}`)
  return { success: true }
}
