'use client'

import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { saveClinicianNote } from './note-actions'

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
 * Save persists the note as the receipt-of-record (patient_notes with
 * source='clinician_fallback'), marks documentation_complete, advances the
 * visit pending → sent so the cashier can take payment immediately. AI runs
 * a separate review check in the background and surfaces a question only
 * if it would disagree (rare).
 *
 * The editor also accepts an `initialContent` so it can serve as the inline
 * "Edit note" affordance after a previous save.
 */

interface PendingDictationCardProps {
  visitId: string
  initialContent?: string
  /** "save" (default) shows the primary save button. "editing" shows save + cancel. */
  mode?: 'save' | 'editing'
  onClose?: () => void
}

// 3-second segments — fast enough that text appears within ~5s of speaking,
// long enough that segment boundaries don't truncate too many words.
const SEGMENT_MS = 3000

export function PendingDictationCard({
  visitId,
  initialContent = '',
  mode = 'save',
  onClose,
}: PendingDictationCardProps) {
  const { getToken } = useAuth()

  const [content, setContent] = useState(initialContent)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingChunks, setPendingChunks] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Mic plumbing — refs so re-renders don't reset the recorder loop.
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const segmentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRecordingRef = useRef(false)
  const inFlightRef = useRef(0)

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
    } catch (e) {
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

  // Stop the mic if the component unmounts mid-record.
  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleSave = useCallback(() => {
    setError(null)
    const text = content.trim()
    if (text.length < 10) {
      setError('Add a bit more to the note before saving.')
      return
    }

    startTransition(async () => {
      const result = await saveClinicianNote(visitId, text)
      if (!result.success) {
        setError(result.error)
        return
      }
      onClose?.()
    })
  }, [content, visitId, onClose])

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">
          {mode === 'editing' ? 'Edit clinician note' : 'Clinician note'}
        </h3>
        <p className="text-sm text-muted-foreground">
          Type the note in your own words, or hold the microphone and dictate. Words appear here as
          you speak — there's a ~3 second lag while we transcribe each segment. Save when you're
          done.
        </p>
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

        <span className="text-sm text-muted-foreground ml-auto">{wordCount} words</span>

        {mode === 'editing' && onClose && (
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={isRecording || pending || content.trim().length < 10}
          className="gap-2"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Save
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        After saving, AI checks your work against Uganda HC III guidelines. If it has no concerns,
        you proceed. If it would disagree, it surfaces a question with the source. Rare — most
        notes pass without a peep.
      </p>
    </div>
  )
}
