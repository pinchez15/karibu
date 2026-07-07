'use client'

import { useState, useRef, useCallback, useEffect, useTransition, type RefObject } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Loader2, Mic, Square, PenLine, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  type ClinicalNoteSections,
  type NoteSectionKey,
  NOTE_SECTION_META,
  FOLLOW_UP_TASK_OPTIONS,
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
import { submitPharmacyOrder } from '../actions'
import { draftLinesToRpcInput } from '@/components/prescription/PrescriptionComposer'
import { prescriptionLinesToDrafts } from '@/components/prescription/prescription-line-mappers'
import type { PrescriptionOrderLine, StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

/**
 * Structured clinician note editor (mirrors Android DictationScreen).
 *
 * - Section fields + batch-on-stop dictation per focused section
 * - Autosave draft + sync visit clinical summary (labs can queue before Sign)
 * - Save draft: explicit flush without signing
 * - Sign: attestation + documentation_complete
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
  staffRole?: StaffRole | null
  /** AI Incorporate — prefill a section and scroll into view. */
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
  staffRole = null,
  incorporatePrefill = null,
  onIncorporateApplied,
  editorRef,
}: PendingDictationCardProps) {
  const { getToken } = useAuth()

  const structuredDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const sectionRefs = useRef<Partial<Record<NoteSectionKey, HTMLTextAreaElement | null>>>({})

  const noteIdRef = useRef<string>(initialNoteId ?? crypto.randomUUID())

  const [sections, setSections] = useState<ClinicalNoteSections>(() =>
    initialSections ? parseClinicalNoteSections(initialSections) : parseClinicalNoteSections(null),
  )
  const [focusedSection, setFocusedSection] = useState<NoteSectionKey | null>(null)
  const [recordingSection, setRecordingSection] = useState<NoteSectionKey | null>(null)
  const [transcribingSection, setTranscribingSection] = useState<NoteSectionKey | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [savingDraft, setSavingDraft] = useState(false)
  const [pharmacyPending, setPharmacyPending] = useState(false)
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
    setFocusedSection(incorporatePrefill.section)

    if (incorporatePrefill.section !== 'AdditionalNote') {
      structuredDetailsRef.current?.setAttribute('open', '')
    }

    requestAnimationFrame(() => {
      editorRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const target =
        incorporatePrefill.section === 'AdditionalNote'
          ? sectionRefs.current.AdditionalNote
          : sectionRefs.current[incorporatePrefill.section]
      target?.focus()
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
    if (!focusedSection) {
      setError('Click a section field first, then tap the mic to dictate.')
      return
    }
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
        const blob = new Blob(recordedChunksRef.current, { type: mimeType })
        const target = recordingTargetRef.current
        recordingTargetRef.current = null
        setRecordingSection(null)
        if (target) void transcribeBlob(blob, target)
      }
      recorder.start()
      isRecordingRef.current = true
      recordingTargetRef.current = focusedSection
      setRecordingSection(focusedSection)
      setIsRecording(true)
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }, [focusedSection, isRecording, isTranscribing, recordingSection, transcribeBlob])

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
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
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

  const handleSendToPharmacy = useCallback(() => {
    setPharmacyPending(true)
    setError(null)
    void (async () => {
      await flushPendingAutosave()

      if (pharmacyReturned && prescriptionLines.length > 0) {
        const lines = draftLinesToRpcInput(prescriptionLinesToDrafts(prescriptionLines))
        if (lines.length === 0) {
          setPharmacyPending(false)
          setError('No prescription lines to resubmit.')
          return
        }
        const result = await submitPharmacyOrder(visitId, {
          lines,
          medicationsSummary: sections.medications.trim(),
        })
        setPharmacyPending(false)
        if (!result.success) {
          setError(result.error)
          return
        }
        setPharmacySubmitted(true)
        return
      }

      const meds = sections.medications.trim()
      if (!meds) {
        setPharmacyPending(false)
        setError('Add medications in the Pharmacy section first.')
        return
      }
      const result = await submitPharmacyOrder(visitId, meds)
      setPharmacyPending(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setPharmacySubmitted(true)
    })()
  }, [
    sections.medications,
    visitId,
    flushPendingAutosave,
    pharmacyReturned,
    prescriptionLines,
  ])

  const activeSection = recordingSection ?? transcribingSection
  const micStatus = isRecording && activeSection
    ? `Recording ${sectionDisplayLabel(activeSection)}… tap stop when done`
    : isTranscribing && activeSection
      ? `Transcribing ${sectionDisplayLabel(activeSection)}…`
      : 'Tap a section field, then mic to dictate'

  const canSubmitPharmacy =
    staffRole &&
    ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole) &&
    (pharmacyReturned
      ? prescriptionLines.length > 0 || sections.medications.trim().length > 0
      : sections.medications.trim().length > 0) &&
    !pharmacySubmitted &&
    !pharmacyReturned &&
    !isRecording &&
    !isTranscribing

  const canResubmitPharmacy =
    staffRole &&
    ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole) &&
    (prescriptionLines.length > 0 || sections.medications.trim().length > 0) &&
    pharmacyReturned &&
    !isRecording &&
    !isTranscribing

  const isReview = variant === 'review'

  return (
    <div
      ref={editorRef}
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
            Update medications below, then resubmit to pharmacy.
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

      {!isReview && (
      <p className="text-sm text-muted-foreground">
        Dictate or type the whole visit here — tap the mic and speak, no clicking field to
        field. Expand structured fields only if you want to fill sections individually.
        Sign when the note is complete.
      </p>
      )}

      {/* Unified dictation area (note #7a) — matches the Android single-flow feel. */}
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
            sectionRefs.current.AdditionalNote = el
          }}
          value={sections.additionalNote}
          onChange={(e) => setSections((prev) => ({ ...prev, additionalNote: e.target.value }))}
          onFocus={() => setFocusedSection('AdditionalNote')}
          placeholder="Dictate the visit: complaint, history, exam, diagnosis, plan…"
          className={`leading-relaxed ${
            isReview ? 'min-h-[100px]' : 'min-h-[220px]'
          } ${
            recordingSection === 'AdditionalNote' && isRecording ? 'border-amber ring-1 ring-amber/30' : ''
          }`}
          disabled={pending || (isRecording && recordingSection !== 'AdditionalNote') || isTranscribing}
          rows={isReview ? 5 : 9}
        />
      </div>

      <details ref={structuredDetailsRef} className="rounded-lg border border-line-soft">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Structured fields (optional)
        </summary>
        <div className="space-y-4 px-3 pb-3 pt-1">
      {NOTE_SECTION_META.map((meta) => {
        const isRec = recordingSection === meta.key && isRecording
        const isTrans = transcribingSection === meta.key && isTranscribing
        const fieldEnabled =
          !pending && !savingDraft && (!isRecording || recordingSection === meta.key) && !isTranscribing
        const value = String(sections[meta.field] ?? '')

        return (
          <div key={meta.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </Label>
              {isRec && (
                <span className="text-xs font-semibold text-amber-ink">Recording…</span>
              )}
              {isTrans && (
                <span className="text-xs font-semibold text-cobalt">Transcribing…</span>
              )}
            </div>
            <Textarea
              ref={(el) => {
                sectionRefs.current[meta.key] = el
              }}
              value={value}
              onChange={(e) =>
                setSections((prev) => ({ ...prev, [meta.field]: e.target.value }))
              }
              onFocus={() => setFocusedSection(meta.key)}
              placeholder={meta.placeholder}
              className={`leading-relaxed ${
                isRec ? 'border-amber ring-1 ring-amber/30' : ''
              } ${isTrans ? 'border-cobalt ring-1 ring-cobalt/30' : ''}`}
              disabled={!fieldEnabled}
              rows={meta.minLines ?? 2}
            />
            {meta.key === 'Medications' && (
              <div className="pt-1">
                {pharmacySubmitted && !pharmacyReturned ? (
                  <p className="text-sm font-medium text-green">Sent to pharmacy</p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canSubmitPharmacy || pharmacyPending}
                    onClick={handleSendToPharmacy}
                  >
                    {pharmacyPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : pharmacyReturned ? (
                      'Resubmit to pharmacy'
                    ) : (
                      'Send to pharmacy'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
        </div>
      </details>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-up tasks
        </Label>
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_TASK_OPTIONS.map((option) => {
            const selected = sections.followUpTasks.includes(option)
            return (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={selected ? 'default' : 'outline'}
                disabled={pending || isRecording || isTranscribing}
                onClick={() =>
                  setSections((prev) => ({
                    ...prev,
                    followUpTasks: selected
                      ? prev.followUpTasks.filter((t) => t !== option)
                      : [...prev.followUpTasks, option],
                  }))
                }
              >
                {option}
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

      {/* Floating dictate button (#7d) — always reachable: focus any field, then
          tap to dictate into it without scrolling to the action bar. */}
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={pending || savingDraft || isTranscribing}
        title={focusedSection ? 'Dictate into the focused field' : 'Tap a field first, then dictate'}
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
