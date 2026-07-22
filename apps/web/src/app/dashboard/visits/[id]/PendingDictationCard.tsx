'use client'

import { useState, useRef, useCallback, useEffect, useTransition, type RefObject, type MutableRefObject } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square, PenLine, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  type ClinicalNoteSections,
  type NoteSectionKey,
  CLINICAL_NOTE_PLACEHOLDER,
  PATIENT_NEXT_STEP_OPTIONS,
  parseClinicalNoteSections,
  sectionsToClinicianText,
  sectionsHaveClinicalContent,
  sectionText,
  appendToSection,
  sectionDisplayLabel,
} from '@/lib/clinical-note-sections'
import type { DictationIncorporate } from '@/lib/ai-review-helpers'
import {
  autosaveDraftNote,
  queueDraftAiAssist,
  saveDraftNote,
  signClinicianNote,
} from './note-actions'
import { VisitLabPanel } from '@/components/lab/VisitLabPanel'
import { VisitPharmacyPanel } from '@/components/prescription/VisitPharmacyPanel'
import type { PharmacyCatalogDrug, PrescriptionOrderLine, StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

/**
 * Unified clinician note editor.
 *
 * - One narrative note box (AI draft review / MOH guidelines run on this text)
 * - Collapsed catalog pickers for pharmacy + lab (no free-text orders)
 * - Patient next-steps chips (patient-facing instructions, not clinician tasks)
 */

interface PendingDictationCardProps {
  visitId: string
  initialSections?: ClinicalNoteSections | null
  initialNoteId?: string | null
  mode?: 'save' | 'editing'
  /** Review Notes panel: tighter layout, context shown by parent. */
  variant?: 'default' | 'review'
  showLabBanner?: boolean
  onClose?: () => void
  labResults?: string | null
  labAbnormal?: boolean
  labStatus?: string | null
  pharmacyOrderSubmitted?: boolean
  pharmacyReturned?: boolean
  dispenseNotes?: string | null
  prescriptionLines?: PrescriptionOrderLine[]
  prescribingCatalog?: PharmacyCatalogDrug[]
  staffRole?: StaffRole | null
  /** AI Incorporate — prefill the note and optionally open lab/Rx pickers. */
  incorporatePrefill?: DictationIncorporate | null
  onIncorporateApplied?: () => void
  editorRef?: RefObject<HTMLDivElement | null>
}

const AUTOSAVE_DEBOUNCE_MS = 1500

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function PendingDictationCard({
  visitId,
  initialSections = null,
  initialNoteId = null,
  mode = 'save',
  variant = 'default',
  showLabBanner = true,
  onClose,
  labResults = null,
  labAbnormal = false,
  labStatus = null,
  pharmacyOrderSubmitted = false,
  pharmacyReturned = false,
  dispenseNotes = null,
  prescriptionLines = [],
  prescribingCatalog,
  staffRole = null,
  incorporatePrefill = null,
  onIncorporateApplied,
  editorRef,
}: PendingDictationCardProps) {
  const { getToken } = useAuth()

  const pharmacyDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const labDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const noteIdRef = useRef<string>(initialNoteId ?? crypto.randomUUID())

  const [sections, setSections] = useState<ClinicalNoteSections>(() =>
    initialSections ? parseClinicalNoteSections(initialSections) : parseClinicalNoteSections(null),
  )
  const [focusedSection, setFocusedSection] = useState<NoteSectionKey | null>('AdditionalNote')
  const [recordingSection, setRecordingSection] = useState<NoteSectionKey | null>(null)
  const [transcribingSection, setTranscribingSection] = useState<NoteSectionKey | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [savingDraft, setSavingDraft] = useState(false)
  const [pharmacySubmitted, setPharmacySubmitted] = useState(pharmacyOrderSubmitted)
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingTargetRef = useRef<NoteSectionKey | null>(null)
  const isRecordingRef = useRef(false)
  const recordedChunksRef = useRef<Blob[]>([])

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftAiQueuedRef = useRef(false)
  const lastSavedTranscriptRef = useRef<string>(sectionsToClinicianText(sections))
  const inFlightAutosaveRef = useRef<Promise<void> | null>(null)
  // "Latest ref" for flushPendingAutosave so the unmount cleanup and the
  // pagehide/visibilitychange listener (registered once, deps: []) can
  // always reach the current closure without re-subscribing on every
  // keystroke. Assigning during render is intentional here (see React's
  // "latest ref" pattern) — it has no rendering side effects.
  const flushPendingAutosaveRef = useRef<() => Promise<void>>(async () => {})
  // Guards against the unmount cleanup and the pagehide/visibilitychange
  // listener both firing a teardown flush for the same pending edit. Reset
  // whenever new dirty content is scheduled so a later hide/unmount still
  // gets its own flush.
  const teardownFlushedRef = useRef(false)

  const transcript = sectionsToClinicianText(sections)
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
  const canSign =
    (transcript.trim().length >= 10 || sectionsHaveClinicalContent(sections)) &&
    !isRecording &&
    !isTranscribing &&
    !pending &&
    !savingDraft

  const persistDraft = useCallback(
    async (nextSections: ClinicalNoteSections) => {
      const text = sectionsToClinicianText(nextSections)
      if (text === lastSavedTranscriptRef.current) return
      setAutosaveStatus('saving')
      const promise = (async () => {
        const result = await autosaveDraftNote({
          note_id: noteIdRef.current,
          visit_id: visitId,
          transcript: text,
          sections: nextSections,
        })
        if (result.success) {
          lastSavedTranscriptRef.current = text
          setAutosaveStatus('saved')
          if (!draftAiQueuedRef.current && text.trim().length >= 50) {
            draftAiQueuedRef.current = true
            void queueDraftAiAssist({ visit_id: visitId, sections: nextSections })
          }
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

  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const trimmed = transcript.trim()
    if (trimmed.length < 3) return
    if (trimmed === lastSavedTranscriptRef.current.trim()) return

    // New unsaved content is scheduled — re-arm the teardown-flush guard so
    // a later hide/unmount (after this one already fired once) still flushes.
    teardownFlushedRef.current = false

    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(sections)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [sections, transcript, persistDraft])

  useEffect(() => {
    if (!incorporatePrefill) return

    setSections((prev) => appendToSection(prev, incorporatePrefill.section, incorporatePrefill.prefill))
    setFocusedSection('AdditionalNote')

    if (incorporatePrefill.openRxPicker) {
      pharmacyDetailsRef.current?.setAttribute('open', '')
    }
    if (incorporatePrefill.openLabPicker) {
      labDetailsRef.current?.setAttribute('open', '')
    }

    requestAnimationFrame(() => {
      editorRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      noteTextareaRef.current?.focus()
      onIncorporateApplied?.()
    })
  }, [incorporatePrefill, editorRef, onIncorporateApplied])

  const flushPendingAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (transcript.trim().length >= 3 && transcript !== lastSavedTranscriptRef.current) {
      await persistDraft(sections)
    }
    if (inFlightAutosaveRef.current) {
      try {
        await inFlightAutosaveRef.current
      } catch {
        /* Sign surfaces its own error */
      }
    }
  }, [sections, transcript, persistDraft])

  flushPendingAutosaveRef.current = flushPendingAutosave

  const transcribeBlob = useCallback(
    async (blob: Blob, target: NoteSectionKey) => {
      if (blob.size < 800) {
        setError('Recording too short. Hold the mic a little longer.')
        return
      }
      setIsTranscribing(true)
      setTranscribingSection(target)
      try {
        const clerkToken = await getToken()
        if (!clerkToken) {
          setError('Not signed in. Please refresh.')
          return
        }
        const contextTail = sectionText(sections, target).trim().slice(-400)
        const formData = new FormData()
        formData.append('audio', blob, 'session.webm')
        if (contextTail) formData.append('context', contextTail)
        formData.append('section', target)

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
          setError(
            `Transcription failed for ${sectionDisplayLabel(target)} (${response.status}). Try again.`,
          )
          console.warn(`Whisper batch ${response.status}: ${body.slice(0, 120)}`)
          return
        }

        const result = (await response.json()) as { text?: string }
        const newText = result.text?.trim() || ''
        if (!newText) return

        setSections((prev) => appendToSection(prev, target, newText))
      } catch (e) {
        setError(`Transcription failed: ${(e as Error).message}`)
      } finally {
        setIsTranscribing(false)
        setTranscribingSection(null)
      }
    },
    [getToken, sections],
  )

  const startRecording = useCallback(async () => {
    setError(null)
    const target: NoteSectionKey = focusedSection ?? 'AdditionalNote'
    if (isRecording || isTranscribing) return

    recordedChunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        const recordedTarget = recordingTargetRef.current
        recordingTargetRef.current = null
        setRecordingSection(null)
        if (recordedTarget) {
          void transcribeBlob(new Blob(recordedChunksRef.current, { type: mimeType }), recordedTarget)
        }
      }
      recorder.start()
      isRecordingRef.current = true
      recordingTargetRef.current = target
      setRecordingSection(target)
      setFocusedSection(target)
      setIsRecording(true)
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }, [focusedSection, isRecording, isTranscribing, transcribeBlob])

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    setIsRecording(false)
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      // Navigating away (or any unmount) within the 1500ms autosave debounce
      // window used to CANCEL the pending save via clearTimeout alone,
      // silently dropping whatever the clinician just typed. Flush instead
      // of just clearing — fire-and-forget, cleanup functions can't be async.
      if (!teardownFlushedRef.current) {
        teardownFlushedRef.current = true
        void flushPendingAutosaveRef.current()
      }
    }
  }, [])

  // Covers the tab-close / browser-navigation case, which the unmount
  // cleanup above doesn't see (React never unmounts before the page goes
  // away). Best-effort only: server actions can't use navigator.sendBeacon,
  // so this is a plain async call that may be aborted if the browser tears
  // the page down before the request completes — it still fixes the far
  // more common in-app navigation case via the unmount cleanup.
  useEffect(() => {
    const flushOnHide = () => {
      if (teardownFlushedRef.current) return
      teardownFlushedRef.current = true
      void flushPendingAutosaveRef.current()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnHide()
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushOnHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const handleSaveDraft = useCallback(() => {
    setError(null)
    setSavingDraft(true)
    void (async () => {
      await flushPendingAutosave()
      const result = await saveDraftNote({
        note_id: noteIdRef.current,
        visit_id: visitId,
        sections,
      })
      setSavingDraft(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setAutosaveStatus('saved')
    })()
  }, [flushPendingAutosave, sections, visitId])

  const handleSign = useCallback(() => {
    setError(null)
    const text = transcript.trim()
    if (text.length < 10 && !sectionsHaveClinicalContent(sections)) {
      setError('Add a bit more to the note before signing.')
      return
    }

    startTransition(async () => {
      await flushPendingAutosave()
      const result = await signClinicianNote(visitId, text, noteIdRef.current, sections)
      if (!result.success) {
        setError(result.error)
        return
      }
      onClose?.()
    })
  }, [transcript, sections, visitId, onClose, flushPendingAutosave])

  const activeSection = recordingSection ?? transcribingSection
  const micStatus = isRecording && activeSection
    ? 'Recording… tap stop when done'
    : isTranscribing && activeSection
      ? 'Transcribing…'
      : 'Tap Dictate to speak into the note'

  const canOrderLabs =
    staffRole != null && ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole)

  const canOrderPharmacy =
    staffRole != null && ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole)

  const isReview = variant === 'review'

  return (
    <div
      ref={(node) => {
        if (editorRef) {
          ;(editorRef as MutableRefObject<HTMLDivElement | null>).current = node
        }
      }}
      className={cn('space-y-4', !isReview && 'bg-card border border-border rounded-lg p-4')}
    >
      {!isReview && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            {mode === 'editing' ? 'Edit clinician note' : 'Clinician note'}
          </h3>
          <AutosaveIndicator status={autosaveStatus} />
        </div>
      )}

      {isReview && (
        <div className="flex items-center justify-between gap-2">
          <AutosaveIndicator status={autosaveStatus} />
        </div>
      )}

      {pharmacyReturned && (
        <div className="rounded-xl border border-amber/30 bg-amber-soft p-3 text-sm">
          <p className="text-xs font-semibold text-amber-ink mb-1">Pharmacy returned for clarification</p>
          {dispenseNotes && <p className="whitespace-pre-wrap">{dispenseNotes}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Update the prescription under Order medications, then resubmit.
          </p>
        </div>
      )}

      {showLabBanner && labResults && labResults.trim() && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            labAbnormal
              ? 'border-amber/30 bg-amber-soft'
              : 'border-border bg-muted'
          }`}
        >
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            Lab result {labStatus === 'done' || labStatus === 'abnormal' ? 'ready' : ''}
          </p>
          <p className="whitespace-pre-wrap">{labResults.trim()}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Review results here, update your note if needed, then sign when ready.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Clinician note
          </Label>
          {recordingSection === 'AdditionalNote' && isRecording && (
            <span className="text-xs font-semibold text-amber-ink">Recording…</span>
          )}
          {transcribingSection === 'AdditionalNote' && isTranscribing && (
            <span className="text-xs font-semibold text-cobalt">Transcribing…</span>
          )}
        </div>
        <Textarea
          ref={(el) => {
            noteTextareaRef.current = el
          }}
          value={sections.additionalNote}
          onChange={(e) => setSections((prev) => ({ ...prev, additionalNote: e.target.value }))}
          onFocus={() => setFocusedSection('AdditionalNote')}
          placeholder={CLINICAL_NOTE_PLACEHOLDER}
          className={`leading-relaxed ${
            isReview ? 'min-h-[100px]' : 'min-h-[220px]'
          } ${
            recordingSection === 'AdditionalNote' && isRecording ? 'border-amber ring-1 ring-amber/30' : ''
          }`}
          disabled={pending || (isRecording && recordingSection !== 'AdditionalNote') || isTranscribing}
          rows={isReview ? 5 : 9}
        />
      </div>

      {canOrderPharmacy && (
        <details
          ref={pharmacyDetailsRef}
          className="rounded-lg border border-line-soft"
          open={pharmacyReturned || undefined}
        >
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Order medications
          </summary>
          <div className="px-3 pb-3 pt-1">
            <VisitPharmacyPanel
              visitId={visitId}
              alreadySubmitted={pharmacySubmitted}
              pharmacyReturned={pharmacyReturned}
              dispenseNotes={dispenseNotes}
              prescriptionLines={prescriptionLines}
              staffRole={staffRole ?? null}
              prescribingCatalog={prescribingCatalog}
              onSubmitted={(medicationsSummary) => {
                setPharmacySubmitted(true)
                setSections((prev) => ({
                  ...prev,
                  medications: medicationsSummary.trim() || prev.medications,
                }))
              }}
            />
          </div>
        </details>
      )}

      {canOrderLabs && (
        <details ref={labDetailsRef} className="rounded-lg border border-line-soft">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Order lab tests
          </summary>
          <div className="px-3 pb-3 pt-1">
            <VisitLabPanel visitId={visitId} staffRole={staffRole ?? null} />
          </div>
        </details>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Patient next steps
        </Label>
        <p className="text-xs text-muted-foreground">
          Instructions for the patient after this visit (shown on the note / receipt) — not clinic
          worklist tasks.
        </p>
        <div className="flex flex-wrap gap-2">
          {PATIENT_NEXT_STEP_OPTIONS.map((option) => {
            const selected = sections.followUpTasks.includes(option.value)
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={selected ? 'default' : 'outline'}
                disabled={pending || isRecording || isTranscribing}
                onClick={() =>
                  setSections((prev) => ({
                    ...prev,
                    followUpTasks: selected
                      ? prev.followUpTasks.filter((t) => t !== option.value)
                      : [...prev.followUpTasks, option.value],
                  }))
                }
              >
                {option.label}
              </Button>
            )
          })}
        </div>
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

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={pending || savingDraft || isTranscribing}
          variant={isRecording ? 'destructive' : 'outline'}
          className="gap-2"
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribing
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Dictate
            </>
          )}
        </Button>

        <span className="text-sm text-muted-foreground flex-1 min-w-[12rem]">{micStatus}</span>

        <span className="text-sm text-muted-foreground">{wordCount} words</span>

        {mode === 'editing' && onClose && (
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={pending || savingDraft || isRecording || isTranscribing}
          className="gap-2"
        >
          {savingDraft ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save draft
        </Button>

        <Button
          type="button"
          onClick={handleSign}
          disabled={!canSign}
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
              Sign note
            </>
          )}
        </Button>
      </div>

      {/* Floating dictate button (#7d) — always reachable without scrolling. */}
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={pending || savingDraft || isTranscribing}
        title={isRecording ? 'Stop dictation' : 'Dictate into the clinician note'}
        aria-label={isRecording ? 'Stop dictation' : 'Dictate'}
        className={`fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors disabled:opacity-50 ${
          isRecording ? 'bg-destructive text-white' : 'bg-cobalt text-white hover:bg-cobalt/90'
        }`}
      >
        {isRecording ? (
          <Square className="h-6 w-6" />
        ) : isTranscribing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </button>
    </div>
  )
}

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
