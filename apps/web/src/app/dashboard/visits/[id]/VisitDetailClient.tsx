'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { Mic, MicOff, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { saveVisitNotes, retryVisitProcessing } from '../actions'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import type { Visit, ProviderNote, PatientNote } from '@karibu/shared'

interface VisitWithRelations extends Visit {
  patient: { id: string; display_name: string | null; whatsapp_number: string; date_of_birth: string | null }
  doctor: { id: string; display_name: string } | null
  nurse: { id: string; display_name: string } | null
  provider_notes: ProviderNote | null
  patient_notes: PatientNote | null
  audio_uploads: { status: string; error_message: string | null } | null
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
  recording: { label: 'Recording', color: 'text-amber-700', bg: 'bg-amber-100' },
  uploading: { label: 'Uploading', color: 'text-sky-700', bg: 'bg-sky-100' },
  processing: { label: 'Processing', color: 'text-violet-700', bg: 'bg-violet-100' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-secondary' },
  sent: { label: 'Sent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
}

export function VisitDetailClient({ visit, staffId, payment }: VisitDetailClientProps) {
  const { getToken } = useAuth()
  const [providerNoteContent, setProviderNoteContent] = useState(visit.provider_notes?.note_content || '')
  const [patientNoteContent, setPatientNoteContent] = useState(visit.patient_notes?.content || '')
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dictationTarget, setDictationTarget] = useState<'provider' | 'patient' | null>(null)
  const [transcribingTarget, setTranscribingTarget] = useState<'provider' | 'patient' | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const config = statusConfig[visit.status] || statusConfig.error

  const startDictation = useCallback(async (target: 'provider' | 'patient') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size < 1000) return // Too short, ignore

        setTranscribingTarget(target)
        try {
          const formData = new FormData()
          formData.append('audio', audioBlob, 'dictation.webm')

          // Send Clerk session JWT in Authorization for function-level auth.
          // Send the public anon key in `apikey` so Supabase's platform gateway
          // accepts the request — the function itself ignores it.
          const clerkToken = await getToken()
          if (!clerkToken) {
            setMessage({ type: 'error', text: 'Not signed in. Please refresh.' })
            setTranscribingTarget(null)
            return
          }

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dictate`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${clerkToken}`,
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              },
              body: formData,
            }
          )

          const result = await response.json()
          if (result.text) {
            const setter = target === 'provider' ? setProviderNoteContent : setPatientNoteContent
            setter(prev => prev ? prev + '\n' + result.text : result.text)
          } else if (result.error) {
            setMessage({ type: 'error', text: `Dictation failed: ${result.error}` })
          }
        } catch (error) {
          console.error('Dictation error:', error)
          setMessage({ type: 'error', text: 'Dictation failed' })
        } finally {
          setTranscribingTarget(null)
        }
      }

      mediaRecorder.start()
      setDictationTarget(target)
    } catch (error) {
      console.error('Microphone access error:', error)
      setMessage({ type: 'error', text: 'Could not access microphone. Please allow microphone access.' })
    }
  }, [getToken])

  const stopDictation = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setDictationTarget(null)
  }, [])

  const handleSaveNotes = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const result = await saveVisitNotes(
        visit.id,
        visit.provider_notes?.id || null,
        providerNoteContent,
        visit.patient_notes?.id || null,
        patientNoteContent,
      )

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({ type: 'success', text: 'Notes saved successfully' })
      }
    } catch (error) {
      console.error('Failed to save notes:', error)
      setMessage({ type: 'error', text: 'Failed to save notes' })
    } finally {
      setSaving(false)
    }
  }

  const handlePrintPatientNote = () => {
    window.open(`/dashboard/visits/${visit.id}/print`, '_blank')
  }

  const handleRetryProcessing = async () => {
    setRetrying(true)
    setMessage(null)

    try {
      const result = await retryVisitProcessing(visit.id)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({ type: 'success', text: 'Reprocessing started' })
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch (error) {
      console.error('Failed to retry:', error)
      setMessage({ type: 'error', text: 'Failed to retry processing' })
    } finally {
      setRetrying(false)
    }
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

        {visit.status === 'error' && visit.error_message && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{visit.error_message}</p>
            <Button
              onClick={handleRetryProcessing}
              disabled={retrying}
              variant="destructive"
              className="mt-3"
              size="sm"
            >
              {retrying ? 'Retrying...' : 'Retry Processing'}
            </Button>
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
            <p className="text-sm text-muted-foreground">Language</p>
            <p className="font-medium">{visit.source_language === 'local' ? 'Local Language' : 'English'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Transcription</p>
            <p className="font-medium capitalize">{visit.provider_notes?.transcription_provider || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Consent</p>
            <p className="font-medium">
              {visit.consent_verified ? (
                <span className="text-emerald-700">Verified</span>
              ) : (
                <span className="text-amber-700">Pending</span>
              )}
            </p>
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

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Visit Details */}
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

      {/* HMIS Diagnosis Codes — show on finalized visits */}
      {['sent', 'completed', 'review'].includes(visit.status) && (
        <DiagnosisCoder visitId={visit.id} />
      )}

      {/* Transcript */}
      {visit.provider_notes?.transcript && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Transcript</h3>

          <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto border border-border">
            <p className="text-sm whitespace-pre-wrap font-mono">
              {visit.provider_notes.transcript}
            </p>
          </div>

          {visit.provider_notes.audio_trimmed && (
            <p className="text-xs text-amber-600 mt-2">
              Note: Audio was trimmed to 10 minutes by the transcription provider.
            </p>
          )}
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

      {/* Provider Note */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Provider Note (SOAP)</h3>
          <Button
            variant={dictationTarget === 'provider' ? 'destructive' : 'outline'}
            size="sm"
            onClick={dictationTarget === 'provider' ? stopDictation : () => startDictation('provider')}
            disabled={transcribingTarget === 'provider' || (dictationTarget !== null && dictationTarget !== 'provider')}
            className="gap-2"
          >
            {transcribingTarget === 'provider' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : dictationTarget === 'provider' ? (
              <>
                <MicOff className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Dictate
              </>
            )}
          </Button>
        </div>
        {dictationTarget === 'provider' && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Recording... Tap Stop when done.
          </div>
        )}
        <Textarea
          value={providerNoteContent}
          onChange={(e) => setProviderNoteContent(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
          placeholder="Provider note content... Use the Dictate button to speak your note."
        />
      </div>

      {/* Patient Note */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Patient Note (Plain Language)</h3>
          <Button
            variant={dictationTarget === 'patient' ? 'destructive' : 'outline'}
            size="sm"
            onClick={dictationTarget === 'patient' ? stopDictation : () => startDictation('patient')}
            disabled={transcribingTarget === 'patient' || (dictationTarget !== null && dictationTarget !== 'patient')}
            className="gap-2"
          >
            {transcribingTarget === 'patient' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : dictationTarget === 'patient' ? (
              <>
                <MicOff className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Dictate
              </>
            )}
          </Button>
        </div>
        {dictationTarget === 'patient' && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Recording... Tap Stop when done.
          </div>
        )}
        <Textarea
          value={patientNoteContent}
          onChange={(e) => setPatientNoteContent(e.target.value)}
          className="min-h-[150px] text-sm"
          placeholder="Patient-friendly note content... Use the Dictate button to speak your note."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSaveNotes}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Notes'}
        </Button>

        {['sent', 'completed', 'review'].includes(visit.status) && visit.patient_notes?.content ? (
          <Button
            onClick={handlePrintPatientNote}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Printer className="h-4 w-4" />
            Print patient note
          </Button>
        ) : null}
      </div>
    </div>
  )
}
