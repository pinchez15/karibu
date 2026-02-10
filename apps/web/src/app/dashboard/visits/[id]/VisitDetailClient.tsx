'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import type { Visit, ProviderNote, PatientNote } from '@karibu/shared'

interface VisitWithRelations extends Visit {
  patient: { id: string; display_name: string | null; whatsapp_number: string; date_of_birth: string | null }
  doctor: { id: string; display_name: string } | null
  nurse: { id: string; display_name: string } | null
  provider_notes: ProviderNote | null
  patient_notes: PatientNote | null
  audio_uploads: { status: string; error_message: string | null } | null
  magic_links: { token: string; expires_at: string; used_at: string | null }[] | null
}

interface VisitDetailClientProps {
  visit: VisitWithRelations
  staffId: string
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

export function VisitDetailClient({ visit, staffId }: VisitDetailClientProps) {
  const [providerNoteContent, setProviderNoteContent] = useState(visit.provider_notes?.note_content || '')
  const [patientNoteContent, setPatientNoteContent] = useState(visit.patient_notes?.content || '')
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = getSupabase()
  const config = statusConfig[visit.status] || statusConfig.error

  const handleSaveNotes = async () => {
    setSaving(true)
    setMessage(null)

    try {
      if (visit.provider_notes) {
        const { error: providerError } = await supabase
          .from('provider_notes')
          .update({ note_content: providerNoteContent })
          .eq('id', visit.provider_notes.id)
        if (providerError) throw providerError
      }

      if (visit.patient_notes) {
        const { error: patientError } = await supabase
          .from('patient_notes')
          .update({ content: patientNoteContent })
          .eq('id', visit.patient_notes.id)
        if (patientError) throw patientError
      }

      setMessage({ type: 'success', text: 'Notes saved successfully' })
    } catch (error) {
      console.error('Failed to save notes:', error)
      setMessage({ type: 'error', text: 'Failed to save notes' })
    } finally {
      setSaving(false)
    }
  }

  const handleResendWhatsApp = async () => {
    setResending(true)
    setMessage(null)

    try {
      const magicLink = visit.magic_links?.[0]
      if (!magicLink) throw new Error('No magic link found')

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            visit_id: visit.id,
            magic_link_token: magicLink.token,
          }),
        }
      )

      const result = await response.json()
      if (result.success) {
        setMessage({ type: 'success', text: 'WhatsApp message sent successfully' })
      } else {
        throw new Error(result.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Failed to resend WhatsApp:', error)
      setMessage({ type: 'error', text: 'Failed to send WhatsApp message' })
    } finally {
      setResending(false)
    }
  }

  const handleRetryProcessing = async () => {
    setRetrying(true)
    setMessage(null)

    try {
      const { error: clearError } = await supabase
        .from('visits')
        .update({ status: 'processing', error_message: null, error_at: null })
        .eq('id', visit.id)
      if (clearError) throw clearError

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ visit_id: visit.id }),
        }
      )

      if (!response.ok) throw new Error('Failed to trigger reprocessing')

      setMessage({ type: 'success', text: 'Reprocessing started' })
      setTimeout(() => window.location.reload(), 2000)
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
            <h2 className="text-xl font-bold">
              {visit.patient?.display_name || 'Unknown Patient'}
            </h2>
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

      {/* Transcript */}
      {visit.provider_notes?.transcript && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Transcript</h3>

          {visit.source_language === 'local' && visit.provider_notes.transcript_original && (
            <div className="mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Original (Local Language)</p>
              <div className="bg-amber-50 rounded-lg p-4 max-h-48 overflow-y-auto border border-amber-200">
                <p className="text-sm whitespace-pre-wrap font-mono">
                  {visit.provider_notes.transcript_original}
                </p>
              </div>
            </div>
          )}

          <div>
            {visit.source_language === 'local' && (
              <p className="text-sm font-medium text-muted-foreground mb-2">English Translation</p>
            )}
            <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto border border-border">
              <p className="text-sm whitespace-pre-wrap font-mono">
                {visit.provider_notes.transcript_english || visit.provider_notes.transcript}
              </p>
            </div>
          </div>

          {visit.provider_notes.audio_trimmed && (
            <p className="text-xs text-amber-600 mt-2">
              Note: Audio was trimmed to 10 minutes by the transcription provider.
            </p>
          )}
        </div>
      )}

      {/* Provider Note */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Provider Note (SOAP)</h3>
        <Textarea
          value={providerNoteContent}
          onChange={(e) => setProviderNoteContent(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
          placeholder="Provider note content..."
        />
      </div>

      {/* Patient Note */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Patient Note (Plain Language)</h3>
        <Textarea
          value={patientNoteContent}
          onChange={(e) => setPatientNoteContent(e.target.value)}
          className="min-h-[150px] text-sm"
          placeholder="Patient-friendly note content..."
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

        {['sent', 'completed'].includes(visit.status) && visit.magic_links?.length ? (
          <Button
            onClick={handleResendWhatsApp}
            disabled={resending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {resending ? 'Sending...' : 'Resend WhatsApp'}
          </Button>
        ) : null}

        {visit.magic_links?.length ? (
          <a
            href={`/note/${visit.magic_links[0].token}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              View Patient Link
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  )
}
