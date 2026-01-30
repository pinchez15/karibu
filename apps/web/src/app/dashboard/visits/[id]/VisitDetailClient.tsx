'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
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
  uploading: { label: 'Uploading', color: 'text-blue-700', bg: 'bg-blue-100' },
  processing: { label: 'Processing', color: 'text-purple-700', bg: 'bg-purple-100' },
  review: { label: 'Review', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  sent: { label: 'Sent', color: 'text-green-700', bg: 'bg-green-100' },
  completed: { label: 'Completed', color: 'text-gray-700', bg: 'bg-gray-100' },
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
      // Update provider note
      if (visit.provider_notes) {
        const { error: providerError } = await supabase
          .from('provider_notes')
          .update({ note_content: providerNoteContent })
          .eq('id', visit.provider_notes.id)

        if (providerError) throw providerError
      }

      // Update patient note
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
      if (!magicLink) {
        throw new Error('No magic link found')
      }

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
      // Clear error state
      const { error: clearError } = await supabase
        .from('visits')
        .update({
          status: 'processing',
          error_message: null,
          error_at: null,
        })
        .eq('id', visit.id)

      if (clearError) throw clearError

      // Trigger transcription again
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

      if (!response.ok) {
        throw new Error('Failed to trigger reprocessing')
      }

      setMessage({ type: 'success', text: 'Reprocessing started' })
      // Refresh the page after a short delay
      setTimeout(() => window.location.reload(), 2000)
    } catch (error) {
      console.error('Failed to retry:', error)
      setMessage({ type: 'error', text: 'Failed to retry processing' })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {visit.patient?.display_name || 'Unknown Patient'}
            </h2>
            <p className="text-gray-500">{visit.patient?.whatsapp_number}</p>
          </div>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>

        {visit.status === 'error' && visit.error_message && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{visit.error_message}</p>
            <button
              onClick={handleRetryProcessing}
              disabled={retrying}
              className="mt-3 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {retrying ? 'Retrying...' : 'Retry Processing'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-sm text-gray-500">Visit Date</p>
            <p className="font-medium">{new Date(visit.visit_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Doctor</p>
            <p className="font-medium">{visit.doctor?.display_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Nurse</p>
            <p className="font-medium">{visit.nurse?.display_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Queue Status</p>
            <p className="font-medium capitalize">{visit.queue_status?.replace('_', ' ') || '-'}</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Visit Details */}
      {(visit.diagnosis || visit.medications || visit.follow_up_instructions || visit.tests_ordered) && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Visit Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visit.diagnosis && (
              <div>
                <p className="text-sm text-gray-500">Diagnosis</p>
                <p className="mt-1">{visit.diagnosis}</p>
              </div>
            )}
            {visit.medications && (
              <div>
                <p className="text-sm text-gray-500">Medications</p>
                <p className="mt-1">{visit.medications}</p>
              </div>
            )}
            {visit.follow_up_instructions && (
              <div>
                <p className="text-sm text-gray-500">Follow-up Instructions</p>
                <p className="mt-1">{visit.follow_up_instructions}</p>
              </div>
            )}
            {visit.tests_ordered && (
              <div>
                <p className="text-sm text-gray-500">Tests Ordered</p>
                <p className="mt-1">{visit.tests_ordered}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript */}
      {visit.provider_notes?.transcript && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transcript</h3>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {visit.provider_notes.transcript}
            </p>
          </div>
        </div>
      )}

      {/* Provider Note */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Provider Note (SOAP)</h3>
        <textarea
          value={providerNoteContent}
          onChange={(e) => setProviderNoteContent(e.target.value)}
          rows={12}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          placeholder="Provider note content..."
        />
      </div>

      {/* Patient Note */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Note (Plain Language)</h3>
        <textarea
          value={patientNoteContent}
          onChange={(e) => setPatientNoteContent(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="Patient-friendly note content..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSaveNotes}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Notes'}
        </button>

        {['sent', 'completed'].includes(visit.status) && visit.magic_links?.length && (
          <button
            onClick={handleResendWhatsApp}
            disabled={resending}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {resending ? 'Sending...' : 'Resend WhatsApp'}
          </button>
        )}

        {visit.magic_links?.length && (
          <a
            href={`/note/${visit.magic_links[0].token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
          >
            View Patient Link
          </a>
        )}
      </div>
    </div>
  )
}
