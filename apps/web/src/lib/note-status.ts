import type { ProviderNoteStatus } from '@karibu/shared'

// Clinical-note status display map. Mirrors visit-status.ts but for
// provider_notes.status (the source of truth for the note lifecycle after
// migration 044 introduced cosigned + addended).
//
// Filter chip order matches the clinician's mental model: drafts at the top,
// open work in the middle (pending cosign / awaiting amendments), terminal
// states at the bottom.

export interface NoteStatusDisplay {
  label: string
  color: string
  bg: string
}

export const NOTE_STATUS_DISPLAY: Record<ProviderNoteStatus, NoteStatusDisplay> = {
  draft: { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' },
  signed: { label: 'Signed', color: 'text-accent', bg: 'bg-accent/10' },
  cosigned: { label: 'Cosigned', color: 'text-accent', bg: 'bg-accent/10' },
  addended: { label: 'Addended', color: 'text-primary', bg: 'bg-primary/10' },
  amended: { label: 'Amended', color: 'text-primary', bg: 'bg-primary/10' },
  voided: { label: 'Voided', color: 'text-destructive', bg: 'bg-destructive/10' },
}

export const NOTE_STATUS_FILTER_ORDER: ProviderNoteStatus[] = [
  'draft',
  'signed',
  'cosigned',
  'addended',
  'amended',
  'voided',
]

// Senior roles that can cosign a mid-level's note. Mirrors the role check in
// rpc_cosign_provider_note (migration 044).
export const COSIGN_ROLES = new Set([
  'admin',
  'doctor',
  'clinical_officer',
  'midwife',
])

// Attending roles that can amend a previously-signed note.
export const AMEND_ROLES = COSIGN_ROLES

// Senior roles authorised to void a signed note (mirrors migration 039's
// rpc_void_provider_note).
export const VOID_ROLES = new Set(['admin', 'doctor', 'clinical_officer'])

// Anyone clinical can addend (rpc_addend_provider_note in migration 044).
export const ADDEND_ROLES = new Set([
  'admin',
  'doctor',
  'clinical_officer',
  'midwife',
  'nurse',
  'nursing_assistant',
])
