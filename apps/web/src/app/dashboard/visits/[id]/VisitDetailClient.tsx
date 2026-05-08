'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Mic, Printer, Sparkles, ChevronDown, ChevronRight, RotateCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import { PendingDictationCard } from './PendingDictationCard'
import { retryAiStructure } from './ai-actions'
import type { Visit, ProviderNote, PatientNote } from '@karibu/shared'
import { cn } from '@/lib/utils'

// Visit detail page. Two paths converge here:
//
//   AI path (existing): pending -> review -> sent -> completed
//      pending  -> PendingDictationCard (web record/submit) OR
//                  "AI structuring..." while Inngest runs
//      review   -> review queue handles edit + approve/reject
//      sent     -> print + payment
//      completed-> receipt
//      error    -> re-dictate
//
//   Offline-first / direct save path (Android, since migration 029):
//      pending + !documentation_complete -> dictation in progress
//      pending + documentation_complete  -> AI was triggered post-save and
//                                            Inngest is mid-flight
//      sent                              -> direct-saved (skips AI review),
//                                            print + payment available
//      completed -> receipt
//
// `documentation_complete` is the durable signal from rpc_mark_documentation_complete
// (also flips status pending -> sent atomically). PendingDictationCard is
// gated on !documentation_complete so direct-saved visits never show it.

interface VisitWithRelations extends Visit {
  patient: { id: string; display_name: string | null; whatsapp_number: string | null; date_of_birth: string | null }
  doctor: { id: string; display_name: string } | null
  nurse: { id: string; display_name: string } | null
  provider_notes: ProviderNote | null
  patient_notes: PatientNote | null
  // Split by source on the server (apps/web/src/app/dashboard/visits/[id]/page.tsx).
  // patient_notes_clinician is the receipt-of-record; patient_notes_ai is the
  // AI summary, surfaced as collapsible reference material.
  patient_notes_clinician: PatientNote | null
  patient_notes_ai: PatientNote | null
}

interface PaymentData {
  receipt_number: string
  amount_ugx: number
  payment_method: string
  status: string
  service_type: string | null
  created_at: string
  collector: { display_name: string } | null
}

interface VisitDetailClientProps {
  visit: VisitWithRelations
  staffId: string
  payment?: PaymentData | null
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'To Dictate', color: 'text-primary', bg: 'bg-primary/10' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-primary/10' },
  sent: { label: 'Sent', color: 'text-accent', bg: 'bg-accent/10' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-destructive', bg: 'bg-destructive/10' },
}

export function VisitDetailClient({ visit, payment }: VisitDetailClientProps) {
  const config = statusConfig[visit.status] || statusConfig.error

  const handlePrintPatientNote = () => {
    window.open(`/dashboard/visits/${visit.id}/print`, '_blank')
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={`/dashboard/patients/${visit.patient?.id}`}
              className="text-xl font-bold hover:underline"
            >
              {visit.patient?.display_name || 'Unknown Patient'}
            </Link>
            {visit.patient?.whatsapp_number && (
              <p className="text-muted-foreground font-mono">{visit.patient.whatsapp_number}</p>
            )}
          </div>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>

        {visit.status === 'error' && (
          <div className="mt-4 p-4 bg-destructive/5 rounded-xl border border-destructive/20 space-y-2">
            <p className="text-sm font-medium text-destructive">AI structuring failed</p>
            {visit.error_message && (
              <p className="text-sm text-destructive/90">{visit.error_message}</p>
            )}
            <p className="text-sm text-destructive/90">
              Re-dictate to clear the error and try again. The original transcript is preserved.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">Visit Date</p>
            <p className="font-medium font-mono">{new Date(visit.visit_date).toLocaleDateString('en-GB')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Doctor</p>
            <p className="font-medium">{visit.doctor?.display_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Review</p>
            <p className="font-medium capitalize">{visit.review_status?.replace('_', ' ') || 'Pending'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Nurse</p>
            <p className="font-medium">{visit.nurse?.display_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Queue Status</p>
            <p className="font-medium capitalize">{visit.queue_status?.replace('_', ' ') || '-'}</p>
          </div>
        </div>
      </div>

      {/* Note editor — desktop clinicians type or dictate the note here. After
          save, documentation_complete=true and the visit moves to 'sent';
          AI runs automatically in the background (Inngest poller, ~60s) and
          appears as a collapsible section beneath. Always shown until the
          clinician marks the note complete. */}
      {!visit.documentation_complete && (
        <PendingDictationCard
          visitId={visit.id}
          initialContent={visit.provider_notes?.transcript ?? ''}
        />
      )}

      {/* Visit Details (flattened by Inngest persist step) */}
      {(visit.diagnosis || visit.medications || visit.follow_up_instructions || visit.tests_ordered) && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Visit Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visit.diagnosis && (
              <div>
                <p className="text-sm text-muted-foreground">Diagnosis</p>
                <p className="font-medium">{visit.diagnosis}</p>
              </div>
            )}
            {visit.medications && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  Medications
                  <DispensingBadge status={visit.dispensing_status} />
                </p>
                <p className="font-medium whitespace-pre-wrap">{visit.medications}</p>
                {visit.dispense_notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Dispenser note: {visit.dispense_notes}
                  </p>
                )}
              </div>
            )}
            {visit.follow_up_instructions && (
              <div>
                <p className="text-sm text-muted-foreground">Follow-up Instructions</p>
                <p className="font-medium">{visit.follow_up_instructions}</p>
              </div>
            )}
            {visit.tests_ordered && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  Tests Ordered
                  <LabBadge status={visit.lab_status} abnormal={visit.lab_abnormal} />
                </p>
                <p className="font-medium whitespace-pre-wrap">{visit.tests_ordered}</p>
                {visit.lab_results && (
                  <div className={`mt-2 rounded-md p-2.5 text-sm ${visit.lab_abnormal ? 'bg-amber-soft border border-amber/30' : 'bg-muted'}`}>
                    <p className="text-xs text-muted-foreground mb-1">Result</p>
                    <p className="whitespace-pre-wrap">{visit.lab_results}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HMIS Diagnosis Codes — coded automatically by Inngest, can be
          confirmed/edited here once the visit is past pending. */}
      {['sent', 'completed', 'review'].includes(visit.status) && (
        <DiagnosisCoder visitId={visit.id} />
      )}

      {/* Clinician note (always shown, expanded — receipt-of-record) */}
      {visit.documentation_complete &&
        (visit.patient_notes_clinician?.content || visit.provider_notes?.transcript) && (
          <ClinicianNoteCard
            visitId={visit.id}
            content={
              visit.patient_notes_clinician?.content ?? visit.provider_notes?.transcript ?? ''
            }
            canEdit={visit.status !== 'completed'}
          />
        )}

      {/* AI structured note — collapsible, appears beneath. The clinician's
          note is the source of truth; this section is reference material. */}
      <AiStructuredSection
        visitId={visit.id}
        status={visit.ai_structure_status}
        error={visit.ai_structure_error}
        attempts={visit.ai_structure_attempts}
        soap={visit.provider_notes?.note_content ?? null}
        patientSummary={visit.patient_notes_ai?.content ?? null}
      />

      {/* Raw transcript — surfaced only when the clinician's `patient_notes`
          row hasn't been written yet (mid-sync), or when the clinician used
          Whisper and wants to see the raw words separately. The "Clinician
          note" card above prefers patient_notes_clinician.content, which is
          the same content but explicitly authored. */}
      {visit.provider_notes?.transcript &&
        !visit.patient_notes_clinician?.content && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Dictation</h3>
          </div>
          <div className="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto border border-border">
            <p className="text-sm whitespace-pre-wrap font-mono">
              {visit.provider_notes.transcript}
            </p>
          </div>
        </div>
      )}

      {/* Payment Summary */}
      {payment && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Payment</h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              payment.status === 'paid' ? 'bg-accent/10 text-accent' :
              payment.status === 'waived' ? 'bg-muted text-muted-foreground' :
              payment.status === 'pending' ? 'bg-amber-500/15 text-amber-700' :
              'bg-destructive/10 text-destructive'
            }`}>
              {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Receipt</p>
              <p className="font-mono font-medium">{payment.receipt_number}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Amount</p>
              <p className="font-semibold text-lg">
                {payment.status === 'waived' ? 'Waived' : `UGX ${payment.amount_ugx.toLocaleString('en-UG')}`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Method</p>
              <p>{payment.payment_method === 'cash' ? 'Cash' : payment.payment_method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'}</p>
            </div>
            {payment.service_type && (
              <div>
                <p className="text-muted-foreground">Service</p>
                <p>{payment.service_type}</p>
              </div>
            )}
            {payment.collector && (
              <div>
                <p className="text-muted-foreground">Recorded by</p>
                <p>{payment.collector.display_name}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Date</p>
              <p>{new Date(payment.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Print receipt — only available once approved */}
      {['sent', 'completed'].includes(visit.status) && visit.patient_notes?.content && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handlePrintPatientNote}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            Print patient note
          </Button>
        </div>
      )}
    </div>
  )
}

interface ClinicianNoteCardProps {
  visitId: string
  content: string
  canEdit: boolean
}

/**
 * Receipt-of-record clinician note. The "Edit note" affordance reuses the
 * editor component — saving re-runs AI structuring (since it sets
 * ai_structure_status='not_started' again, the poller picks it up).
 */
function ClinicianNoteCard({ visitId, content, canEdit }: ClinicianNoteCardProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <PendingDictationCard
        visitId={visitId}
        initialContent={content}
        mode="editing"
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold">Clinician note</h3>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-7 text-xs"
          >
            Edit note
          </Button>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
      <p className="text-xs text-muted-foreground mt-3">
        This is what prints on the receipt. Edit re-runs AI structuring on the new text.
      </p>
    </div>
  )
}

interface AiStructuredSectionProps {
  visitId: string
  status: Visit['ai_structure_status']
  error: string | null
  attempts: number
  soap: string | null
  patientSummary: string | null
}

/**
 * AI-structured note card. Collapsed by default — the clinician's note above
 * is the receipt-of-record. Surfaces SOAP + plain-language patient summary
 * + retry button on failure.
 */
function AiStructuredSection({
  visitId,
  status,
  error,
  attempts,
  soap,
  patientSummary,
}: AiStructuredSectionProps) {
  const [expanded, setExpanded] = useState(status === 'completed' || status === 'failed')
  const [pending, startTransition] = useTransition()
  const [retryError, setRetryError] = useState<string | null>(null)

  // Don't render at all if there's nothing to say (e.g. visit was created but
  // documentation_complete=false, AI hasn't been queued).
  if (status === 'not_started' && !soap && !patientSummary) {
    return null
  }

  function handleRetry() {
    setRetryError(null)
    startTransition(async () => {
      const r = await retryAiStructure(visitId)
      if (!r.success) setRetryError(r.error)
    })
  }

  const headerInfo = (() => {
    switch (status) {
      case 'pending':
        return { label: 'Queued for AI', cls: 'bg-line-soft text-muted-foreground' }
      case 'running':
        return { label: 'Structuring…', cls: 'bg-cobalt-soft text-cobalt' }
      case 'completed':
        return { label: 'Done', cls: 'bg-green-soft text-green' }
      case 'failed':
        return { label: 'Failed', cls: 'bg-amber-soft text-amber-ink' }
      case 'skipped':
        return { label: 'Skipped', cls: 'bg-line-soft text-muted-foreground' }
      default:
        return { label: 'Pending', cls: 'bg-line-soft text-muted-foreground' }
    }
  })()

  const isInFlight = status === 'pending' || status === 'running'

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-amber" />
          <span className="font-semibold">AI structured note</span>
          <span className={cn('inline-flex items-center px-2 py-px rounded-full text-[11px] font-semibold', headerInfo.cls)}>
            {headerInfo.label}
          </span>
          {attempts > 1 && (
            <span className="text-[11px] text-muted-foreground">attempt {attempts}</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          {isInFlight && (
            <div className="text-sm text-muted-foreground">
              Karibu AI is reading the note and structuring it into SOAP, suggesting HMIS
              codes, and writing a plain-language summary for the patient. Usually under 15s.
            </div>
          )}

          {status === 'failed' && (
            <div className="bg-amber-soft border border-amber/30 rounded-md p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 text-amber-ink font-semibold">
                <RotateCw className="h-3.5 w-3.5" />
                AI couldn't structure this visit
              </div>
              {error && (
                <div className="text-xs text-body font-mono break-all">{error}</div>
              )}
              <Button
                onClick={handleRetry}
                disabled={pending}
                size="sm"
                variant="outline"
              >
                {pending ? 'Retrying…' : 'Retry AI structuring'}
              </Button>
              {retryError && (
                <div className="text-xs text-destructive">{retryError}</div>
              )}
            </div>
          )}

          {soap && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                SOAP
              </h4>
              <pre className="text-sm whitespace-pre-wrap font-mono bg-muted rounded-md p-3 border border-border">
                {soap}
              </pre>
            </div>
          )}

          {patientSummary && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                Plain-language summary
                <CheckCircle2 className="h-3 w-3 text-green" />
              </h4>
              <p className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/50 rounded-md p-3 border border-border">
                {patientSummary}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                The receipt prints the clinician note above; this AI version is reference for the clinician.
              </p>
            </div>
          )}

          {status === 'completed' && !soap && !patientSummary && (
            <div className="text-sm text-muted-foreground">
              AI ran but produced no structured output. Try retrying.
            </div>
          )}

          {status === 'completed' && (
            <Button
              onClick={handleRetry}
              disabled={pending}
              size="sm"
              variant="outline"
            >
              {pending ? 'Re-running…' : 'Re-run AI structuring'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function DispensingBadge({ status }: { status: Visit['dispensing_status'] }) {
  if (status === 'not_started') return null
  const map: Record<Visit['dispensing_status'], { label: string; cls: string }> = {
    not_started: { label: 'Pending', cls: 'bg-line-soft text-muted-foreground' },
    in_progress: { label: 'In progress', cls: 'bg-cobalt-soft text-cobalt' },
    dispensed: { label: 'Dispensed', cls: 'bg-green-soft text-green' },
    partial: { label: 'Partial', cls: 'bg-amber-soft text-amber-ink' },
    out_of_stock: { label: 'Out of stock', cls: 'bg-red-soft text-red' },
  }
  const c = map[status]
  return (
    <span className={`inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}

function LabBadge({
  status,
  abnormal,
}: {
  status: Visit['lab_status']
  abnormal: boolean
}) {
  if (status === 'not_ordered') return null
  if (abnormal) {
    return (
      <span className="inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold bg-amber-soft text-amber-ink">
        Abnormal
      </span>
    )
  }
  const map: Record<Visit['lab_status'], { label: string; cls: string }> = {
    not_ordered: { label: '—', cls: 'bg-line-soft text-muted-foreground' },
    pending: { label: 'Pending', cls: 'bg-line-soft text-muted-foreground' },
    running: { label: 'Running', cls: 'bg-cobalt-soft text-cobalt' },
    done: { label: 'Done', cls: 'bg-green-soft text-green' },
    abnormal: { label: 'Abnormal', cls: 'bg-amber-soft text-amber-ink' },
  }
  const c = map[status]
  return (
    <span className={`inline-flex items-center px-2 py-px rounded-full text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}
