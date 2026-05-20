'use client'

import { useState, useTransition } from 'react'
import { History, Loader2, MessageSquarePlus, PenLine, Stamp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  addendClinicianNote,
  amendClinicianNote,
  cosignClinicianNote,
  voidClinicianNote,
} from './note-actions'
import {
  ADDEND_ROLES,
  AMEND_ROLES,
  COSIGN_ROLES,
  NOTE_STATUS_DISPLAY,
  VOID_ROLES,
} from '@/lib/note-status'
import type { ProviderNoteStatus, StaffRole } from '@karibu/shared'

export interface AddendumView {
  id: string
  addendum_text: string
  created_at: string
  created_by_name: string | null
}

export interface AmendmentView {
  id: string
  reason: string
  amended_at: string
  amended_by_name: string | null
  prior_transcript: string | null
  new_transcript: string | null
}

interface NoteLifecycleActionsProps {
  noteId: string | null
  noteStatus: ProviderNoteStatus | null
  noteAuthorId: string | null
  requiresCosign: boolean
  currentTranscript: string | null
  staffId: string
  staffRole: StaffRole
  addendums: AddendumView[]
  amendments: AmendmentView[]
}

type Mode = 'idle' | 'addend' | 'amend' | 'void'

export function NoteLifecycleActions({
  noteId,
  noteStatus,
  noteAuthorId,
  requiresCosign,
  currentTranscript,
  staffId,
  staffRole,
  addendums,
  amendments,
}: NoteLifecycleActionsProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [showAmendmentHistory, setShowAmendmentHistory] = useState(false)

  if (!noteId || !noteStatus || noteStatus === 'draft') {
    return null
  }

  const display = NOTE_STATUS_DISPLAY[noteStatus]
  const canAddend = ADDEND_ROLES.has(staffRole) && noteStatus !== 'voided'
  const canAmend = AMEND_ROLES.has(staffRole) && noteStatus !== 'voided'
  const canVoid = VOID_ROLES.has(staffRole) && noteStatus !== 'voided'
  const canCosign =
    requiresCosign &&
    COSIGN_ROLES.has(staffRole) &&
    staffId !== noteAuthorId &&
    noteStatus !== 'voided'

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${display.bg} ${display.color}`}>
          {display.label}
        </span>
        {requiresCosign && noteStatus !== 'cosigned' && noteStatus !== 'voided' && (
          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-soft text-amber-ink">
            Awaiting cosign
          </span>
        )}
        {amendments.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAmendmentHistory((s) => !s)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <History className="h-3 w-3" />
            {amendments.length} amendment{amendments.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {addendums.length > 0 && (
        <div className="space-y-2">
          <div className="kh-meta">ADDENDA</div>
          {addendums.map((a) => (
            <div key={a.id} className="border-l-2 border-primary pl-3 py-1">
              <div className="text-sm whitespace-pre-wrap">{a.addendum_text}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {a.created_by_name ?? 'Unknown'} ·{' '}
                {new Date(a.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAmendmentHistory && amendments.length > 0 && (
        <div className="space-y-3 bg-muted/40 rounded-md p-3">
          <div className="kh-meta">AMENDMENT HISTORY</div>
          {amendments.map((a) => (
            <details key={a.id} className="border border-border rounded-md p-2 bg-card">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{a.reason}</span>{' '}
                <span className="text-muted-foreground">
                  — {a.amended_by_name ?? 'Unknown'} ·{' '}
                  {new Date(a.amended_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </summary>
              {a.prior_transcript && (
                <div className="mt-2">
                  <div className="kh-meta">BEFORE</div>
                  <div className="text-xs whitespace-pre-wrap bg-destructive/5 p-2 rounded mt-1">
                    {a.prior_transcript}
                  </div>
                </div>
              )}
              {a.new_transcript && (
                <div className="mt-2">
                  <div className="kh-meta">AFTER</div>
                  <div className="text-xs whitespace-pre-wrap bg-accent/5 p-2 rounded mt-1">
                    {a.new_transcript}
                  </div>
                </div>
              )}
            </details>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canCosign && <CosignButton noteId={noteId} />}
        {canAddend && (
          <Button size="sm" variant="outline" onClick={() => setMode('addend')}>
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> Add addendum
          </Button>
        )}
        {canAmend && (
          <Button size="sm" variant="outline" onClick={() => setMode('amend')}>
            <PenLine className="h-3.5 w-3.5 mr-1" /> Amend
          </Button>
        )}
        {canVoid && (
          <Button size="sm" variant="outline" onClick={() => setMode('void')}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Void
          </Button>
        )}
      </div>

      {mode === 'addend' && (
        <AddendumForm noteId={noteId} onDone={() => setMode('idle')} />
      )}
      {mode === 'amend' && (
        <AmendmentForm
          noteId={noteId}
          initialTranscript={currentTranscript ?? ''}
          onDone={() => setMode('idle')}
        />
      )}
      {mode === 'void' && <VoidForm noteId={noteId} onDone={() => setMode('idle')} />}
    </div>
  )
}

function CosignButton({ noteId }: { noteId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await cosignClinicianNote({ note_id: noteId })
            if (!r.success) setError(r.error)
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Stamp className="h-3.5 w-3.5 mr-1" />}
        Cosign
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function AddendumForm({ noteId, onDone }: { noteId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2 bg-muted/40 rounded-md p-3">
      <Label htmlFor="addendum">Addendum text</Label>
      <Textarea
        id="addendum"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="New information to append. The original note is preserved."
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending || text.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const r = await addendClinicianNote({ note_id: noteId, addendum_text: text })
              if (!r.success) setError(r.error)
              else onDone()
            })
          }
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Append
        </Button>
      </div>
    </div>
  )
}

function AmendmentForm({
  noteId,
  initialTranscript,
  onDone,
}: {
  noteId: string
  initialTranscript: string
  onDone: () => void
}) {
  const [transcript, setTranscript] = useState(initialTranscript)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2 bg-muted/40 rounded-md p-3">
      <div className="space-y-1">
        <Label htmlFor="reason">Reason for amendment</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. corrected drug dose after dispenser query"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="transcript">Amended transcript</Label>
        <Textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={6}
        />
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending || reason.trim().length === 0 || transcript.trim().length < 10}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const r = await amendClinicianNote({
                note_id: noteId,
                transcript,
                reason,
              })
              if (!r.success) setError(r.error)
              else onDone()
            })
          }
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Save amendment
        </Button>
      </div>
    </div>
  )
}

function VoidForm({ noteId, onDone }: { noteId: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2 bg-destructive/5 border border-destructive/30 rounded-md p-3">
      <div className="text-sm font-medium text-destructive">Void this note</div>
      <p className="text-xs text-muted-foreground">
        Voiding marks the note as withdrawn. It stays in the audit trail and remains visible to senior staff.
      </p>
      <Label htmlFor="void-reason">Reason</Label>
      <Textarea
        id="void-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Required"
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || reason.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const r = await voidClinicianNote({ note_id: noteId, reason })
              if (!r.success) setError(r.error)
              else onDone()
            })
          }
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Void note
        </Button>
      </div>
    </div>
  )
}
