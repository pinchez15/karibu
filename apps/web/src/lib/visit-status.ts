import type { VisitStatus } from '@karibu/shared'

// Clinical-note display labels for the underlying VisitStatus enum.
//
// The DB still stores the original lifecycle values (pending/review/sent/
// completed/error) — the user-facing language was reworked in May 2026 to
// match the clinical-note states clinicians recognize from other EMRs:
//
//   pending   -> Draft           (note being composed)
//   review    -> Pending Review  (transcribed, awaiting clinician sign-off)
//   sent      -> Signed          (clinician authenticated; legal record)
//   completed -> Closed          (encounter wrapped, payment recorded)
//   error     -> Errored         (AI structuring failed or marked in error)
//
// Cosigned / Addended / Amended / Voided are valid clinical states but not
// yet wired through the schema — see hc3-rollout-plan.md for the migration
// that introduces them. Add a label here when the underlying status value
// becomes available.

export interface StatusDisplay {
  label: string
  /** Tailwind text color class */
  color: string
  /** Tailwind background color class */
  bg: string
}

export const VISIT_STATUS_DISPLAY: Record<VisitStatus, StatusDisplay> = {
  pending: { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' },
  review: { label: 'Pending Review', color: 'text-primary', bg: 'bg-primary/10' },
  sent: { label: 'Signed', color: 'text-accent', bg: 'bg-accent/10' },
  completed: { label: 'Closed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Errored', color: 'text-destructive', bg: 'bg-destructive/10' },
}

// Filter chip order for the patient list. "all" is rendered separately.
export const VISIT_STATUS_FILTER_ORDER: VisitStatus[] = [
  'pending',
  'review',
  'sent',
  'completed',
  'error',
]

export function getStatusDisplay(status: string | null | undefined): StatusDisplay {
  if (!status) return VISIT_STATUS_DISPLAY.error
  return (
    VISIT_STATUS_DISPLAY[status as VisitStatus] ?? {
      label: status,
      color: 'text-muted-foreground',
      bg: 'bg-muted',
    }
  )
}
