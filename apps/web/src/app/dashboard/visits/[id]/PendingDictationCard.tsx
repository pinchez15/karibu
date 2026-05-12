'use client'

import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { autosaveDraftNote, signClinicianNote } from './note-actions'

/**
 * Desktop clinician note editor.
 *
 * The clinician is the medical authority; AI is a backstop. Two input paths:
 *   - Type the note, or
 *   - Record via browser mic — chunks stream to Whisper every ~3s so words
 *     appear in the textarea while the clinician is still speaking. After
 *     stop, they can edit freely; tapping Record again appends another
 *     stream of chunks to whatever's already in the textarea.
 *
 * Persistence is split (Phase 2 of the patient-centered architecture plan):
 *   - autosave: every edit debounces 1.5s, then writes provider_notes as
 *     status='draft' via rpc_upsert_provider_note. No patient_notes write,
 *     no visit advance, no AI trigger.
 *   - Sign Note: explicit clinician action — flushes any pending autosave,
 *     then runs the full signClinicianNote pipeline (status='signed',
 *     patient_notes upsert, visit pending→sent, ai_review_status reset).
 *
 * The editor also accepts an `initialContent` (and matching `initialNoteId`)
 * so it can serve as the inline "Edit note" affordance after a previous
 * sign — re-signing reuses the same provider_notes row instead of creating
 * a duplicate draft.
 */

interface PendingDictationCardProps {
  visitId: string
  initialContent?: string
  /** Existing provider_notes.id for this visit, if any. The editor keeps the
   *  same id stable across autosaves so the row is upserted in place. */
  initialNoteId?: string | null
  /** "save" (default) shows the primary save button. "editing" shows save + cancel. */
  mode?: 'save' | 'editing'
  onClose?: () => void
}

// 3-second segments — fast enough that text appears within ~5s of speaking,
// long enough that segment boundaries don't truncate too many words.
const SEGMENT_MS = 3000

// 1.5s after the last keystroke / Whisper append, persist a draft.
const AUTOSAVE_DEBOUNCE_MS = 1500

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function PendingDictationCard({
  visitId,
  initialContent = '',
  initialNoteId = null,
  mode = 'save',
  onClose,
}: PendingDictationCardProps) {
  const { getToken } = useAuth()

  // Stable note id for this editing session. If the visit already has a
  // provider_notes row we reuse its id so autosave upserts in place; otherwise
  // we generate one on mount and the first autosave inserts it.
  const noteIdRef = useRef<string>(initialNoteId ?? crypto.randomUUID())

  const [content, setContent] = useState(initialContent)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingChunks, setPendingChunks] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')

  // Mic plumbing — refs so re-renders don't reset the recorder loop.
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const segmentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRecordingRef = useRef(false)
  const inFlightRef = useRef(0)

  // Autosave plumbing.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef<string>(initialContent)
  const inFlightAutosaveRef = useRef<Promise<void> | null>(null)

  // Persist `text` as a draft. Resolves once the server round-trip completes
  // (or fails). Other code can `await` the in-flight promise to "flush"
  // before triggering a Sign.
  const persistDraft = useCallback(
    async (text: string) => {
      // Skip if nothing changed since the last successful save — saves on
      // round-trips when the user is just tabbing in and out of the textarea.
      if (text === lastSavedContentRef.current) return
      setAutosaveStatus('saving')
      const promise = (async () => {
        const result = await autosaveDraftNote({
          note_id: noteIdRef.current,
          visit_id: visitId,
          transcript: text,
        })
        if (result.success) {
          lastSavedContentRef.current = text
          setAutosaveStatus('saved')
        } else {
          setAutosaveStatus('failed')
        }
      })()
      inFlightAutosaveRef.current = promise
      try {
        await promise
      } finally {
        if (inFlightAutosaveRef.current === promise) {
          inFlightAutosaveRef.current = null
        }
      }
    },
    [visitId],
  )

  // Re-arm the debounce timer whenever the textarea content changes.
  // Short content (<3 chars) doesn't auto-persist — there's nothing
  // worth keeping yet, and it avoids creating empty provider_notes rows.
  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const trimmed = content.trim()
    if (trimmed.length < 3) return
    if (trimmed === lastSavedContentRef.current.trim()) return

    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(content)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [content, persistDraft])

  const flushPendingAutosave = useCallback(async () => {
    // Cancel any pending debounce and persist the latest content immediately.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (content.trim().length >= 3 && content !== lastSavedContentRef.current) {
      await persistDraft(content)
    }
    // Also wait for any in-flight autosave that beat us to the punch.
    if (inFlightAutosaveRef.current) {
      try {
        await inFlightAutosaveRef.current
      } catch {
        /* swallow — Sign will surface its own error */
      }
    }
  }, [content, persistDraft])

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 1500) return // sub-half-second of audio — skip
      inFlightRef.current += 1
      setPendingChunks(inFlightRef.current)
      try {
        const clerkToken = await getToken()
        if (!clerkToken) {
          setError('Not signed in. Please refresh.')
          return
        }
        const formData = new FormData()
        formData.append('audio', blob, 'segment.webm')

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dictate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${clerkToken}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: formData,
          },
        )

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          // Don't blow up the entire stream over one bad chunk — log and continue.
          console.warn(`Whisper chunk ${response.status}: ${body.slice(0, 120)}`)
          return
        }

        const result = (await response.json()) as { text?: string }
        const newText = result.text?.trim() || ''
        if (!newText) return

        // Append to whatever's currently in the textarea. The clinician can
        // edit between chunks; we never overwrite their edits, only append.
        // The setContent below re-arms the autosave debounce automatically
        // via the useEffect above.
        setContent((prev) => {
          const trimmed = prev.replace(/\s+$/, '')
          if (trimmed.length === 0) return newText
          // Add a space (or sentence break) between segments.
          const sep = /[.!?…]$/.test(trimmed) ? ' ' : ' '
          return trimmed + sep + newText
        })
      } catch (e) {
        console.warn(`Chunk transcription failed: ${(e as Error).message}`)
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1)
        setPendingChunks(inFlightRef.current)
      }
    },
    [getToken],
  )

  const recordNextSegment = useCallback(() => {
    if (!isRecordingRef.current || !streamRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

    const chunks: Blob[] = []
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      // Fire and forget — don't block the next segment on transcription.
      void transcribeBlob(blob)
      // If we're still recording, immediately start the next segment so
      // there's no audible gap.
      if (isRecordingRef.current) {
        recordNextSegment()
      }
    }

    recorder.start()
    segmentTimeoutRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, SEGMENT_MS)
  }, [transcribeBlob])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      isRecordingRef.current = true
      setIsRecording(true)
      recordNextSegment()
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }, [recordNextSegment])

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    setIsRecording(false)
    if (segmentTimeoutRef.current) {
      clearTimeout(segmentTimeoutRef.current)
      segmentTimeoutRef.current = null
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Stop the mic + cancel any pending autosave if the component unmounts mid-record.
  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current)
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleSign = useCallback(() => {
    setError(null)
    const text = content.trim()
    if (text.length < 10) {
      setError('Add a bit more to the note before signing.')
      return
    }

    startTransition(async () => {
      // Flush any in-flight / pending autosave so the server side has the
      // latest transcript before we flip status='signed'.
      await flushPendingAutosave()

      const result = await signClinicianNote(visitId, text, noteIdRef.current)
      if (!result.success) {
        setError(result.error)
        return
      }
      onClose?.()
    })
  }, [content, visitId, onClose, flushPendingAutosave])

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">
          {mode === 'editing' ? 'Edit clinician note' : 'Clinician note'}
        </h3>
      </div>

      <div className="relative">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Patient reports fever and headache for 3 days. T 38.4°C. RDT positive (Pf). Plan: AL 4 tabs BD x 3d, ORS, follow-up 48h."
          className="min-h-[200px] leading-relaxed"
          disabled={pending}
        />
        {(isRecording || pendingChunks > 0) && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-2 bg-cobalt text-white text-xs font-semibold px-2 py-1 rounded-full shadow">
            {isRecording && <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />}
            {isRecording ? 'Listening' : 'Transcribing…'}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start justify-between gap-2">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive hover:opacity-80 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={pending}
          variant={isRecording ? 'destructive' : 'outline'}
          className="gap-2"
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              {content ? 'Add more' : 'Record'}
            </>
          )}
        </Button>

        {pendingChunks > 0 && !isRecording && (
          <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Finishing transcription…
          </span>
        )}

        <AutosaveIndicator status={autosaveStatus} />

        <span className="text-sm text-muted-foreground ml-auto">{wordCount} words</span>

        {mode === 'editing' && onClose && (
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        )}

        <Button
          type="button"
          onClick={handleSign}
          disabled={isRecording || pending || content.trim().length < 10}
          className="gap-2"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing
            </>
          ) : (
            <>
              <PenLine className="w-3.5 h-3.5" />
              Sign Note
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

/** Subtle autosave status indicator — sits between the recording UI and the
 *  word count. Hidden in the 'idle' state so the row doesn't jump around. */
function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return <span className="text-xs text-muted-foreground">Saved</span>
  }
  return <span className="text-xs text-destructive/80">Save failed</span>
}
