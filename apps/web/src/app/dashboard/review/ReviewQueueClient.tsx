'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Edit, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { approveVisit, rejectVisit, saveProviderNoteEdit } from './actions'

interface ReviewVisit {
  id: string
  visit_date: string
  source_language: string
  patient: { id: string; display_name: string | null; whatsapp_number: string }
  provider_notes: {
    id: string
    note_content: string | null
    transcript: string | null
    transcription_provider: string | null
    transcription_confidence: number | null
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
        setVisits(prev => prev.filter(v => v.id !== visitId))
        setEditingNote(null)
        setMessage({ type: 'success', text: 'Visit approved and notes finalized' })
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

  if (visits.length === 0) {
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
              {visit.provider_notes?.transcription_confidence != null &&
                visit.provider_notes.transcription_confidence < 0.8 && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Low confidence transcription</span>
                </div>
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="px-4 py-4 bg-muted/30 border border-t-0 border-border rounded-b-lg space-y-4">
            {/* Transcript */}
            {visit.provider_notes?.transcript && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">TRANSCRIPT</h3>

                <div className="bg-card rounded-lg p-3 border border-border max-h-48 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">
                    {visit.provider_notes.transcript}
                  </pre>
                </div>

                {visit.provider_notes.transcription_provider && (
                  <p className="text-xs text-muted-foreground">
                    Provider: {visit.provider_notes.transcription_provider}
                    {visit.provider_notes.transcription_confidence != null &&
                      ` (${Math.round(visit.provider_notes.transcription_confidence * 100)}% confidence)`
                    }
                  </p>
                )}
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
                {saving === visit.id ? 'Approving...' : 'Approve & Send Patient Note'}
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
