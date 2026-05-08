'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { saveClinicianNote } from './note-actions'

/**
 * Desktop clinician note editor. Mirrors the Android dictation flow:
 *
 *   - Type the note OR record via browser mic (Whisper). Recording appends
 *     transcribed text to the textarea; the clinician can edit either way.
 *   - Save persists the note as the receipt-of-record (patient_notes with
 *     source='clinician_fallback'), marks documentation_complete, advances
 *     the visit pending→sent so the cashier can take payment.
 *   - AI structuring runs automatically in the background (Inngest poller
 *     within ~60s) — appears as a collapsible "AI structured note" section
 *     beneath this once it lands. No manual trigger.
 *
 * Rendered when !visit.documentation_complete on /dashboard/visits/[id].
 * After save, this card disappears and the saved note + AI section take over.
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

export function PendingDictationCard({
  visitId,
  initialContent = '',
  mode = 'save',
  onClose,
}: PendingDictationCardProps) {
  const { getToken } = useAuth()

  const [content, setContent] = useState(initialContent)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    setError(null)
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
        stream.getTracks().forEach((t) => t.stop())
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size < 1000) {
          setError('Recording too short to transcribe.')
          return
        }
        await transcribeChunk(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (e) {
      setError('Microphone access denied or unavailable.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const transcribeChunk = useCallback(
    async (audioBlob: Blob) => {
      setIsTranscribing(true)
      try {
        const clerkToken = await getToken()
        if (!clerkToken) {
          setError('Not signed in. Please refresh.')
          return
        }

        const formData = new FormData()
        formData.append('audio', audioBlob, 'dictation.webm')

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
          setError(`Transcription failed (${response.status}): ${body.slice(0, 120)}`)
          return
        }

        const result = (await response.json()) as { text?: string }
        const newText = result.text?.trim() || ''
        if (!newText) return

        setContent((prev) => [prev.trim(), newText].filter(Boolean).join(' '))
      } catch (e) {
        setError(`Transcription failed: ${(e as Error).message}`)
      } finally {
        setIsTranscribing(false)
      }
    },
    [getToken],
  )

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
          Type the SOAP note in your own words, or tap the microphone to dictate. Save when you're
          done — the visit can move to payment immediately. AI will structure the note in the
          background and add SOAP, HMIS suggestions, and a plain-language summary as reference
          beneath your note.
        </p>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Patient reports fever and headache for 3 days. T 38.4°C. RDT positive (Pf). Plan: AL 4 tabs BD x 3d, ORS, follow-up 48h."
        className="min-h-[200px] leading-relaxed"
        disabled={pending}
      />

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
          disabled={isTranscribing || pending}
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

        {isTranscribing && (
          <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Transcribing…
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
          disabled={isRecording || isTranscribing || pending || content.trim().length < 10}
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
        Once saved, AI runs automatically in the background. You can keep going — the structured
        note + suggestions appear here when ready (~60s).
      </p>
    </div>
  )
}
