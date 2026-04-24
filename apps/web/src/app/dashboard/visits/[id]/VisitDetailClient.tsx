'use client'

import Link from 'next/link'
import { Mic, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import { PendingDictationCard } from './PendingDictationCard'
import type { Visit, ProviderNote, PatientNote } from '@karibu/shared'

// Visit detail in the dictation-only product is a read-only summary, not an
// editor. The flow is:
//
//   pending  -> PendingDictationCard (record + submit) — or "AI structuring..."
//                while Inngest processes the submitted dictation
//   review   -> review queue handles edit + approve/reject (this page just
//                shows the AI output; the queue is where decisions happen)
//   sent     -> show the print button + AI-generated content
//   completed-> show the receipt + payment
//   error    -> let the clinician re-dictate (clears AI output server-side
//                via the same path as Reject)
//
// No per-textarea dictation, no manual saveVisitNotes — those were the
// pre-pivot dual-note model and would create a parallel editing surface
// alongside PendingDictationCard. Bug fixes / clinician overrides happen on
// the review queue.

interface VisitWithRelations extends Visit {
  patient: { id: string; display_name: string | null; whatsapp_number: string; date_of_birth: string | null }
  doctor: { id: string; display_name: string } | null
  nurse: { id: string; display_name: string } | null
  provider_notes: ProviderNote | null
  patient_notes: PatientNote | null
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
  pending: { label: 'To Dictate', color: 'text-violet-700', bg: 'bg-violet-100' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-secondary' },
  sent: { label: 'Sent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
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
            <p className="text-muted-foreground font-mono">{visit.patient?.whatsapp_number}</p>
          </div>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>

        {visit.status === 'error' && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200 space-y-2">
            <p className="text-sm font-medium text-red-800">AI structuring failed</p>
            {visit.error_message && (
              <p className="text-sm text-red-700">{visit.error_message}</p>
            )}
            <p className="text-sm text-red-700">
              Re-dictate to clear the error and try again. The original transcript is preserved.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">Visit Date</p>
            <p className="font-medium font-mono">{new Date(visit.visit_date).toLocaleDateString()}</p>
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

      {/* Pending visit: dictation card OR "AI is working" hint, depending on
          whether a dictation has been submitted yet. Errored visits also get
          the dictation card so the clinician can re-dictate. */}
      {(visit.status === 'pending' || visit.status === 'error') &&
        !(visit.status === 'pending' && visit.provider_notes?.transcript) && (
          <PendingDictationCard visitId={visit.id} />
        )}
      {visit.status === 'pending' && visit.provider_notes?.transcript && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
          <p className="font-medium text-violet-900">AI is structuring this dictation…</p>
          <p className="text-sm text-violet-800 mt-1">
            Usually under a minute. The visit will move to Review when it&apos;s ready.
          </p>
        </div>
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
                <p className="text-sm text-muted-foreground">Medications</p>
                <p className="font-medium">{visit.medications}</p>
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
                <p className="text-sm text-muted-foreground">Tests Ordered</p>
                <p className="font-medium">{visit.tests_ordered}</p>
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

      {/* Provider Note (read-only — edits happen in the review queue) */}
      {visit.provider_notes?.note_content && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Provider Note (SOAP)</h3>
          <pre className="text-sm whitespace-pre-wrap font-mono bg-muted rounded-lg p-3 border border-border">
            {visit.provider_notes.note_content}
          </pre>
          {visit.status === 'review' && (
            <p className="text-sm text-muted-foreground mt-3">
              Edits and approve/reject happen in the{' '}
              <Link href="/dashboard/review" className="underline">review queue</Link>.
            </p>
          )}
        </div>
      )}

      {/* Patient Note (read-only — what gets printed on the receipt) */}
      {visit.patient_notes?.content && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Patient Note</h3>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {visit.patient_notes.content}
          </p>
        </div>
      )}

      {/* Original dictation transcript — preserved through reject/error so
          the clinician can see what they originally said. */}
      {visit.provider_notes?.transcript && (
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
              payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              payment.status === 'waived' ? 'bg-gray-100 text-gray-600' :
              payment.status === 'pending' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
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
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Printer className="h-4 w-4" />
            Print patient note
          </Button>
        </div>
      )}
    </div>
  )
}
