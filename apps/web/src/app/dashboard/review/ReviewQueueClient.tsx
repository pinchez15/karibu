'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { approveVisit, rejectVisit, saveProviderNoteEdit, recordPayment, skipPayment } from './actions'
import { SERVICE_TYPES } from '@karibu/shared'

interface ReviewVisit {
  id: string
  visit_date: string
  patient: { id: string; display_name: string | null; whatsapp_number: string }
  provider_notes: {
    id: string
    note_content: string | null
    transcript: string | null
    structured_data: Record<string, unknown> | null
    status: string
  } | null
  patient_notes: {
    id: string
    content: string | null
    status: string
  } | null
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
}

// Shape that the structure-dictation Inngest function writes to
// provider_notes.structured_data. Defensive parsing — anything missing or
// malformed just means we render less, not throw.
type DiagnosisSuggestion = {
  name: string
  icd10?: string | null
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  citations: Array<{ title: string; source: string; url?: string | null }>
}
type StructuredData = {
  diagnoses?: DiagnosisSuggestion[]
  learning_note?: string | null
  missing_info?: string[]
}
function parseStructured(raw: Record<string, unknown> | null | undefined): StructuredData {
  if (!raw || typeof raw !== 'object') return {}
  return {
    diagnoses: Array.isArray(raw.diagnoses) ? (raw.diagnoses as DiagnosisSuggestion[]) : [],
    learning_note: typeof raw.learning_note === 'string' ? raw.learning_note : null,
    missing_info: Array.isArray(raw.missing_info) ? (raw.missing_info as string[]) : [],
  }
}

interface ReviewQueueClientProps {
  visits: ReviewVisit[]
  staffId: string
}

export function ReviewQueueClient({ visits: initialVisits, staffId }: ReviewQueueClientProps) {
  const [visits, setVisits] = useState(initialVisits)
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editedSoapNote, setEditedSoapNote] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [paymentVisitId, setPaymentVisitId] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentServiceType, setPaymentServiceType] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentWaived, setPaymentWaived] = useState(false)

  const handleApprove = async (visitId: string) => {
    setSaving(visitId)
    setMessage(null)

    try {
      const visit = visits.find(v => v.id === visitId)
      const editedNote = editingNote === visitId ? editedSoapNote : null
      const result = await approveVisit(
        visitId,
        editedNote !== null ? (visit?.provider_notes?.id || null) : null,
        editedNote,
      )

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setEditingNote(null)
        setPaymentVisitId(visitId)
        setPaymentAmount('')
        setPaymentServiceType('')
        setPaymentNotes('')
        setPaymentWaived(false)
        setMessage({ type: 'success', text: 'Visit approved — record payment below' })
        if (result.printUrl) {
          window.open(result.printUrl, '_blank')
        }
      }
    } catch (error) {
      console.error('Failed to approve:', error)
      setMessage({ type: 'error', text: 'Failed to approve visit' })
    } finally {
      setSaving(null)
    }
  }

  const handleReject = async (visitId: string) => {
    setSaving(visitId)
    setMessage(null)

    try {
      const result = await rejectVisit(visitId)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setVisits(prev => prev.filter(v => v.id !== visitId))
        setMessage({ type: 'success', text: 'Visit sent back for re-processing' })
      }
    } catch (error) {
      console.error('Failed to reject:', error)
      setMessage({ type: 'error', text: 'Failed to reject visit' })
    } finally {
      setSaving(null)
    }
  }

  const handleSaveEdit = async (visitId: string) => {
    const visit = visits.find(v => v.id === visitId)
    if (!visit?.provider_notes) return

    setSaving(visitId)
    try {
      const result = await saveProviderNoteEdit(visit.provider_notes.id, editedSoapNote)
      if (result.error) throw new Error(result.error)

      setEditingNote(null)
      setVisits(prev => prev.map(v =>
        v.id === visitId && v.provider_notes
          ? { ...v, provider_notes: { ...v.provider_notes, note_content: editedSoapNote } }
          : v
      ))
    } catch (error) {
      console.error('Failed to save note:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleRecordPayment = async () => {
    if (!paymentVisitId) return
    if (!paymentWaived && (!paymentAmount || parseInt(paymentAmount) <= 0)) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' })
      return
    }

    setSaving(paymentVisitId)
    try {
      const result = await recordPayment(paymentVisitId, {
        amount_ugx: paymentWaived ? 0 : parseInt(paymentAmount),
        payment_method: 'cash',
        service_type: paymentServiceType || undefined,
        notes: paymentNotes || undefined,
        waived: paymentWaived,
      })

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setVisits(prev => prev.filter(v => v.id !== paymentVisitId))
        setPaymentVisitId(null)
        setMessage({
          type: 'success',
          text: `Payment recorded — Receipt: ${result.receipt_number}`,
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to record payment' })
    } finally {
      setSaving(null)
    }
  }

  const handleSkipPayment = async () => {
    if (!paymentVisitId) return

    setSaving(paymentVisitId)
    try {
      await skipPayment(paymentVisitId)
      setVisits(prev => prev.filter(v => v.id !== paymentVisitId))
      setPaymentVisitId(null)
      setMessage({ type: 'success', text: 'Visit completed (no payment recorded)' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to complete visit' })
    } finally {
      setSaving(null)
    }
  }

  if (visits.length === 0 && !paymentVisitId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-medium mb-2">All caught up!</h2>
            <p className="text-muted-foreground">No visits to review</p>
          </div>
          <Link href="/dashboard">
            <Button>Back to Queue</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Payment form for approved visit */}
      {paymentVisitId && (
        <div className="bg-card border-2 border-primary/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Record Payment</h3>
              <p className="text-sm text-muted-foreground">
                {visits.find(v => v.id === paymentVisitId)?.patient?.display_name || 'Patient'} — Notes approved and ready to print
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <input
              type="checkbox"
              id="waive-payment"
              checked={paymentWaived}
              onChange={(e) => setPaymentWaived(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="waive-payment" className="text-sm text-amber-800 cursor-pointer">
              Waive payment (patient unable to pay)
            </Label>
          </div>

          {!paymentWaived && (
            <div className="space-y-1.5">
              <Label>Amount (UGX)</Label>
              <Input
                type="number"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="25000"
                className="text-lg font-semibold"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Service Type</Label>
            <select
              value={paymentServiceType}
              onChange={(e) => setPaymentServiceType(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Select service type</option>
              {SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Additional payment notes..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleRecordPayment}
              disabled={saving === paymentVisitId}
              className="flex-1 h-11"
            >
              {saving === paymentVisitId
                ? 'Recording...'
                : paymentWaived
                  ? 'Record Waiver'
                  : 'Record Payment'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkipPayment}
              disabled={saving === paymentVisitId}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {visits.map(visit => (
        <Collapsible
          key={visit.id}
          open={expandedVisit === visit.id}
          onOpenChange={(open) => setExpandedVisit(open ? visit.id : null)}
        >
          <CollapsibleTrigger className="w-full bg-card border border-border rounded-lg p-4 text-left hover:bg-secondary/50 transition-colors">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium">
                    {visit.patient?.display_name || 'Unknown Patient'} — {new Date(visit.visit_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {visit.diagnosis || 'No diagnosis yet'}
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  Review &rarr;
                </Button>
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="px-4 py-4 bg-muted/30 border border-t-0 border-border rounded-b-lg space-y-4">
            {/* Dictation transcript */}
            {visit.provider_notes?.transcript && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">DICTATION</h3>

                <div className="bg-card rounded-lg p-3 border border-border max-h-48 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">
                    {visit.provider_notes.transcript}
                  </pre>
                </div>
              </div>
            )}

            {/* Extracted data */}
            {(visit.diagnosis || visit.medications || visit.follow_up_instructions || visit.tests_ordered) && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">EXTRACTED DATA</h3>
                <div className="bg-card rounded-lg p-3 border border-border space-y-2 text-sm">
                  {visit.diagnosis && (
                    <p>
                      <span className="text-muted-foreground">Dx:</span>{' '}
                      {visit.diagnosis} <span className="text-green-600">&#10003;</span>
                    </p>
                  )}
                  {visit.medications && (
                    <p>
                      <span className="text-muted-foreground">Rx:</span>{' '}
                      {visit.medications} <span className="text-green-600">&#10003;</span>
                    </p>
                  )}
                  {visit.follow_up_instructions && (
                    <p>
                      <span className="text-muted-foreground">Follow-up:</span>{' '}
                      {visit.follow_up_instructions} <span className="text-green-600">&#10003;</span>
                    </p>
                  )}
                  {visit.tests_ordered && (
                    <p>
                      <span className="text-muted-foreground">Tests:</span>{' '}
                      {visit.tests_ordered} <span className="text-green-600">&#10003;</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* AI suggestions — shown subtly between the extracted data and
                the SOAP note. Tone: a colleague sharing relevant research,
                not a checker. We only render diagnosis suggestions when the
                model produced them, only render the learning note when there
                is one to share, and only render missing_info when it's
                non-empty (which the prompt restricts to genuinely critical
                gaps). Never blocks the clinician — Approve is always one tap
                away and ignores all of this. */}
            {(() => {
              const s = parseStructured(visit.provider_notes?.structured_data)
              const hasAnything = (s.diagnoses?.length ?? 0) > 0 || s.learning_note || (s.missing_info?.length ?? 0) > 0
              if (!hasAnything) return null
              return (
                <div className="space-y-3">
                  {s.diagnoses && s.diagnoses.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm text-muted-foreground">AI SUGGESTIONS</h3>
                      <div className="space-y-2">
                        {s.diagnoses.map((dx, i) => (
                          <div
                            key={i}
                            className="bg-card rounded-lg p-3 border border-border space-y-1.5"
                          >
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-medium">{dx.name}</span>
                              {dx.icd10 && (
                                <span className="text-xs text-muted-foreground font-mono">{dx.icd10}</span>
                              )}
                              <Badge
                                variant="outline"
                                className={
                                  dx.confidence === 'high' ? 'border-emerald-300 text-emerald-700' :
                                  dx.confidence === 'medium' ? 'border-amber-300 text-amber-700' :
                                  'border-gray-300 text-gray-600'
                                }
                              >
                                {dx.confidence} confidence
                              </Badge>
                            </div>
                            {dx.rationale && (
                              <p className="text-sm text-muted-foreground">{dx.rationale}</p>
                            )}
                            {dx.citations && dx.citations.length > 0 && (
                              <div className="text-xs space-y-0.5 pt-1">
                                {dx.citations.map((c, j) => (
                                  <div key={j} className="text-muted-foreground">
                                    {c.url ? (
                                      <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline decoration-dotted hover:text-foreground"
                                      >
                                        {c.title} <span className="opacity-60">— {c.source}</span>
                                      </a>
                                    ) : (
                                      <span>
                                        {c.title} <span className="opacity-60">— {c.source}</span>
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {s.learning_note && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                      <span className="font-medium">Worth a read: </span>
                      {s.learning_note}
                    </div>
                  )}

                  {s.missing_info && s.missing_info.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium mb-1">Worth confirming:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {s.missing_info.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Provider note (SOAP) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm text-muted-foreground">PROVIDER NOTE (SOAP)</h3>
                {editingNote !== visit.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingNote(visit.id)
                      setEditedSoapNote(visit.provider_notes?.note_content || '')
                    }}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>

              {editingNote === visit.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedSoapNote}
                    onChange={(e) => setEditedSoapNote(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(visit.id)}
                      disabled={saving === visit.id}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingNote(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <pre className="text-sm whitespace-pre-wrap font-mono">
                    {visit.provider_notes?.note_content || 'No note generated yet'}
                  </pre>
                </div>
              )}
            </div>

            {/* Patient note preview */}
            {visit.patient_notes?.content && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">PATIENT NOTE (Preview)</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {visit.patient_notes.content}
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => handleApprove(visit.id)}
                disabled={saving === visit.id}
                className="w-full h-12"
                size="lg"
              >
                {saving === visit.id ? 'Approving...' : 'Approve & Print Patient Note'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleReject(visit.id)}
                disabled={saving === visit.id}
                className="w-full h-10"
              >
                Reject — Re-process
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}
