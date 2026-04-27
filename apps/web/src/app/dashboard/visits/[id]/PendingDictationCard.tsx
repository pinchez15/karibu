'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// Shown on /dashboard/visits/[id] when visit.status === 'pending' AND there
// isn't already a transcript on the way through the AI pipeline. Lets a
// desktop clinician dictate the same way the Android app does — record audio
// in the browser, transcribe via /functions/v1/dictate, edit the text,
// submit to /functions/v1/submit-dictation which fires the Inngest workflow.
//
// Mirrors apps/android/.../ui/dictation/DictationScreen.kt — same endpoints,
// same edit-before-submit flow, same error model.

interface PendingDictationCardProps {
  visitId: string
}

export function PendingDictationCard({ visitId }: PendingDictationCardProps) {
  const router = useRouter()
  const { getToken } = useAuth()

  const [transcript, setTranscript] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
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

        // Append to whatever's already in the textarea. Trim to avoid double
        // spaces from successive chunks.
        setTranscript((prev) => [prev.trim(), newText].filter(Boolean).join(' '))
      } catch (e) {
        setError(`Transcription failed: ${(e as Error).message}`)
      } finally {
        setIsTranscribing(false)
      }
    },
    [getToken],
  )

  const submit = useCallback(async () => {
    const text = transcript.trim()
    if (text.length < 10) {
      setError('Dictate a bit more before submitting.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const clerkToken = await getToken()
      if (!clerkToken) {
        setError('Not signed in. Please refresh.')
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-dictation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${clerkToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ visit_id: visitId, transcript: text }),
        },
      )

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        setError(`Submit failed (${response.status}): ${body.slice(0, 120)}`)
        return
      }

      // Refresh the page so the server-rendered detail picks up the new
      // provider_notes.transcript and renders the "AI is structuring..."
      // state instead of this card.
      router.refresh()
    } catch (e) {
      setError(`Submit failed: ${(e as Error).message}`)
    } finally {
      setIsSubmitting(false)
    }
  }, [transcript, visitId, getToken, router])

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Dictate visit note</h3>
        <p className="text-sm text-muted-foreground">
          Speak the SOAP note in your own words after the patient leaves. The AI will structure it
          for you and suggest diagnoses with citations.
        </p>
      </div>

      <Textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Tap the microphone below and speak. Your words will appear here. You can edit before submitting."
        className="min-h-[160px]"
        disabled={isSubmitting}
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
          disabled={isTranscribing || isSubmitting}
          variant={isRecording ? 'destructive' : 'default'}
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
              {transcript ? 'Add more' : 'Record'}
            </>
          )}
        </Button>

        {isTranscribing && (
          <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Transcribing...
          </span>
        )}

        <span className="text-sm text-muted-foreground ml-auto">{wordCount} words</span>

        <Button
          type="button"
          onClick={submit}
          disabled={isRecording || isTranscribing || isSubmitting || transcript.trim().length < 10}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Submitting
            </>
          ) : (
            'Submit'
          )}
        </Button>
      </div>
    </div>
  )
}
