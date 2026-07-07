'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mic, Printer, Sparkles, CheckCircle2, Send, LogOut } from 'lucide-react'
import { checkOutVisit } from './note-actions'
import { Button } from '@/components/ui/button'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import { PendingDictationCard } from './PendingDictationCard'
import type { ReviewSuggestion } from './ReviewQuestionBanner'
import { AiNotesTimeline } from './AiNotesTimeline'
import {
  VisitCriticalAlertBanner,
  type VisitCriticalAlert,
} from './VisitCriticalAlertBanner'
import type { Visit, ProviderNote, PatientNote, StaffRole, PharmacyCatalogDrug, PrescriptionOrderLine } from '@karibu/shared'
import { cn } from '@/lib/utils'
import { getStatusDisplay } from '@/lib/visit-status'
import {
  parseClinicalNoteSections,
  sectionsHaveClinicalContent,
} from '@/lib/clinical-note-sections'
import { NoteLifecycleActions, type AddendumView, type AmendmentView } from './NoteLifecycleActions'
import { VitalsCard } from './VitalsCard'
import { BookFollowUp } from './BookFollowUp'
import { EbolaScreeningCard, type EbolaScreeningRecord } from './EbolaScreeningCard'
import { VisitPharmacyPanel } from '@/components/prescription/VisitPharmacyPanel'
import { VisitLabPanel } from '@/components/lab/VisitLabPanel'

// Friendly operational labels for queue_status — deliberately not the clinical
// note state. A patient can be "Checked out" with the note still a draft (#6).
const QUEUE_LABELS: Record<string, string> = {
  waiting: 'In clinic',
  with_nurse: 'With nurse',
  ready_for_doctor: 'Ready for clinician',
  with_doctor: 'With clinician',
  completed: 'Checked out',
  cancelled: 'Cancelled',
}
function queueLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return QUEUE_LABELS[status] ?? status.replace(/_/g, ' ')
}

function CheckOutButton({ visitId }: { visitId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      className="gap-2"
      disabled={pending}
      onClick={() => start(async () => { await checkOutVisit(visitId); router.refresh() })}
    >
      <LogOut className="h-4 w-4" />
      {pending ? 'Checking out…' : 'Check out'}
    </Button>
  )
}

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
  ai_review_suggestions?: ReviewSuggestion[] | null
  critical_alerts?: VisitCriticalAlert[] | null
  ebola_protocol_active?: boolean
  ebola_screening?: EbolaScreeningRecord | null
  latest_temp_c?: number | null
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
  staffRole?: StaffRole
  prescribingCatalog?: PharmacyCatalogDrug[]
  prescriptionLines?: PrescriptionOrderLine[]
  payment?: PaymentData | null
  addendums?: AddendumView[]
  amendments?: AmendmentView[]
}

export function VisitDetailClient({
  visit,
  staffId,
  staffRole,
  prescribingCatalog,
  prescriptionLines = [],
  payment,
  addendums = [],
  amendments = [],
}: VisitDetailClientProps) {
  const config = getStatusDisplay(visit.status)
  const pharmacyReturned = visit.dispensing_status === 'returned'

  const initialNoteSections = (() => {
    const parsed = parseClinicalNoteSections(visit.provider_notes?.structured_data ?? null, {
      diagnosis: visit.diagnosis ?? '',
      medications: visit.medications ?? '',
      testsOrdered: visit.tests_ordered ?? '',
      followUpInstructions: visit.follow_up_instructions ?? '',
    })
    const transcript = visit.provider_notes?.transcript?.trim()
    if (!sectionsHaveClinicalContent(parsed) && transcript) {
      return { ...parsed, hpi: transcript }
    }
    return parsed
  })()

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
            {/* Operational presence only — NOT the note/documentation state.
                "Waiting" here no longer implies the note is unfinished (#6). */}
            <p className="text-sm text-muted-foreground">Visit</p>
            <p className="font-medium">{queueLabel(visit.queue_status)}</p>
          </div>
        </div>
      </div>

      {(visit.critical_alerts ?? []).map((alert) => (
        <VisitCriticalAlertBanner key={alert.id} alert={alert} />
      ))}

      {visit.ebola_protocol_active && (
        <EbolaScreeningCard
          visitId={visit.id}
          patientId={visit.patient_id}
          febrile={visit.latest_temp_c != null && visit.latest_temp_c >= 38}
          screening={visit.ebola_screening ?? null}
          tempC={visit.latest_temp_c ?? null}
        />
      )}

      <VitalsCard patientId={visit.patient_id} visitId={visit.id} />

      {pharmacyReturned && (
        <div className="rounded-xl border border-amber/30 bg-amber-soft p-4 text-sm">
          <p className="font-semibold text-amber-ink">Pharmacy returned for clarification</p>
          {visit.dispense_notes && (
            <p className="mt-1 whitespace-pre-wrap text-foreground">{visit.dispense_notes}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Review the dispenser&apos;s note, update prescriptions if needed, then resubmit to pharmacy.
          </p>
        </div>
      )}

      {!visit.documentation_complete && (visit.ai_review_suggestions?.length ?? 0) > 0 && (
        <AiNotesTimeline suggestions={visit.ai_review_suggestions ?? []} />
      )}

      <div className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-medium">Refer to hospital</p>
          <p className="text-sm text-muted-foreground">
            Create a printable transfer summary for the receiving HCIV or hospital.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BookFollowUp patientId={visit.patient_id} />
          {visit.queue_status !== 'completed' && visit.queue_status !== 'cancelled' && (
            <CheckOutButton visitId={visit.id} />
          )}
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/dashboard/referrals/new?visitId=${visit.id}`}>
              <Send className="h-4 w-4" />
              Refer to hospital
            </Link>
          </Button>
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
          initialSections={initialNoteSections}
          initialNoteId={visit.provider_notes?.id ?? null}
          labResults={visit.lab_results}
          labAbnormal={visit.lab_abnormal ?? false}
          labStatus={visit.lab_status}
          pharmacyOrderSubmitted={!!visit.pharmacy_order_submitted_at}
          pharmacyReturned={pharmacyReturned}
          dispenseNotes={visit.dispense_notes}
          prescriptionLines={prescriptionLines}
          staffRole={staffRole ?? null}
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
                <VisitPharmacyPanel
                  visitId={visit.id}
                  alreadySubmitted={!!visit.pharmacy_order_submitted_at}
                  pharmacyReturned={pharmacyReturned}
                  dispenseNotes={visit.dispense_notes}
                  prescriptionLines={prescriptionLines}
                  staffRole={staffRole ?? null}
                  prescribingCatalog={prescribingCatalog}
                />
              </div>
            )}

            <VisitLabPanel visitId={visit.id} staffRole={staffRole ?? null} />
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
            noteId={visit.provider_notes?.id ?? null}
            content={
              visit.patient_notes_clinician?.content ?? visit.provider_notes?.transcript ?? ''
            }
            structuredData={visit.provider_notes?.structured_data ?? null}
            canEdit={visit.status !== 'completed'}
          />
        )}

      {/* Note lifecycle: addendums + amendment history + cosign/amend/void
          actions. Only shown once the note has been signed (status !=
          draft). Role gating lives inside the component + RPC layer. */}
      {visit.documentation_complete && visit.provider_notes && staffRole && (
        <NoteLifecycleActions
          noteId={visit.provider_notes.id}
          noteStatus={visit.provider_notes.status}
          noteAuthorId={visit.provider_notes.created_by ?? visit.provider_notes.finalized_by ?? null}
          requiresCosign={visit.provider_notes.requires_cosign ?? false}
          currentTranscript={visit.provider_notes.transcript}
          staffId={staffId}
          staffRole={staffRole}
          addendums={addendums}
          amendments={amendments}
        />
      )}

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

      {/* Print patient slip — only available once approved */}
      {['sent', 'completed'].includes(visit.status) && visit.patient_notes?.content && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handlePrintPatientNote}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            Print patient slip
          </Button>
        </div>
      )}
    </div>
  )
}

interface ClinicianNoteCardProps {
  visitId: string
  noteId: string | null
  content: string
  structuredData?: Record<string, unknown> | null
  canEdit: boolean
}

/**
 * Receipt-of-record clinician note. The "Edit note" affordance reuses the
 * editor component — re-signing reuses the same provider_notes.id so the
 * row is upserted in place, and it re-runs AI review (since signClinicianNote
 * resets ai_review_status='not_started' and the poller picks it up).
 */
function ClinicianNoteCard({
  visitId,
  noteId,
  content,
  structuredData,
  canEdit,
}: ClinicianNoteCardProps) {
  const [editing, setEditing] = useState(false)

  const editSections = (() => {
    const parsed = parseClinicalNoteSections(structuredData ?? null)
    if (!sectionsHaveClinicalContent(parsed) && content.trim()) {
      return { ...parsed, hpi: content.trim() }
    }
    return parsed
  })()

  if (editing) {
    return (
      <PendingDictationCard
        visitId={visitId}
        initialSections={editSections}
        initialNoteId={noteId}
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


function DispensingBadge({ status }: { status: Visit['dispensing_status'] }) {
  if (status === 'not_started') return null
  const map: Record<NonNullable<Visit['dispensing_status']>, { label: string; cls: string }> = {
    not_started: { label: 'Pending', cls: 'bg-line-soft text-muted-foreground' },
    in_progress: { label: 'In progress', cls: 'bg-cobalt-soft text-cobalt' },
    dispensed: { label: 'Dispensed', cls: 'bg-green-soft text-green' },
    partial: { label: 'Partial', cls: 'bg-amber-soft text-amber-ink' },
    out_of_stock: { label: 'Out of stock', cls: 'bg-red-soft text-red' },
    returned: { label: 'Returned', cls: 'bg-amber-soft text-amber-ink' },
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
