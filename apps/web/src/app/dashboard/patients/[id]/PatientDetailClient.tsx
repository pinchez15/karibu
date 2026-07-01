'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Activity, Loader2, PenLine, Pencil, Plus, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type {
  CareTaskStatus,
  CareTaskType,
  NoteEventData,
  PatientLatestVitals,
  PatientTimelineEvent,
  PaymentEventData,
  ProviderNoteSource,
  StaffRole,
  TaskEventData,
  VisitEventData,
  VitalEventData,
} from '@karibu/shared'
import type { PatientWithDerivedAge } from './actions'
import {
  autosaveDraftPatientNote,
  getPatientTimeline,
  recordPatientVitals,
  signPatientNote,
} from './actions'
import { PatientEditSheet } from './PatientEditSheet'
import { guardianRelationshipLabel } from '@/lib/patient-demographics'
import { VISIT_STATUS_DISPLAY } from '@/lib/visit-status'

// Roles allowed to sign a note (matches signPatientNote / migration 039).
const SIGNING_ROLES = new Set<StaffRole>([
  'admin',
  'doctor',
  'clinical_officer',
  'midwife',
])

// Roles allowed to record vitals (matches recordPatientVitals server action).
const RECORDING_ROLES = new Set<StaffRole>([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

// Patient-only note sources (visit-tied notes use source='visit' elsewhere).
const SOURCE_OPTIONS: { value: ProviderNoteSource; label: string }[] = [
  { value: 'phone_call', label: 'Phone call' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'lab_update', label: 'Lab update' },
  { value: 'pharmacy_update', label: 'Pharmacy update' },
  { value: 'general', label: 'General' },
]

const SOURCE_LABEL: Record<ProviderNoteSource, string> = {
  visit: 'Visit',
  phone_call: 'Phone call',
  follow_up: 'Follow-up',
  lab_update: 'Lab update',
  pharmacy_update: 'Pharmacy update',
  general: 'General',
}

// Mirrors the shared status display map. Re-declared as the generic
// dictionary shape the existing call sites in this file lean on.
const VISIT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = VISIT_STATUS_DISPLAY

const NOTE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' },
  signed: { label: 'Signed', color: 'text-accent', bg: 'bg-accent/10' },
  amended: { label: 'Amended', color: 'text-primary', bg: 'bg-primary/10' },
}

// Care task chip configuration. Mirrors NOTE_STATUS_CONFIG / VISIT_STATUS_CONFIG
// so all timeline status chips share one visual vocabulary.
const TASK_TYPE_LABEL: Record<CareTaskType, string> = {
  lab_followup: 'Lab follow-up',
  phone_callback: 'Phone callback',
  home_visit: 'Home visit',
  medication_review: 'Medication review',
  referral_followup: 'Referral follow-up',
  general: 'General',
}

const TASK_STATUS_CONFIG: Record<CareTaskStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'text-primary', bg: 'bg-primary/10' },
  in_progress: { label: 'In progress', color: 'text-primary', bg: 'bg-primary/10' },
  completed: { label: 'Completed', color: 'text-accent', bg: 'bg-accent/10' },
  // Cancelled tasks are filtered server-side, but keep the entry for safety.
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground', bg: 'bg-muted' },
}

const LAB_STATUS_LABEL: Record<string, string> = {
  not_ordered: 'No labs',
  pending: 'Lab pending',
  running: 'Lab in progress',
  done: 'Lab done',
  abnormal: 'Lab abnormal',
}

const DISPENSING_STATUS_LABEL: Record<string, string> = {
  not_started: 'Pharmacy not started',
  in_progress: 'Dispensing',
  dispensed: 'Dispensed',
  partial: 'Partial dispense',
  out_of_stock: 'Out of stock',
}

// Match the staff role enum from packages/shared. Used to humanise role chips
// on task cards without pulling in a Title-Case helper.
const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  clinical_officer: 'Clinical officer',
  midwife: 'Midwife',
  nursing_assistant: 'Nursing assistant',
  records_officer: 'Records officer',
  lab_tech: 'Lab tech',
  dispenser: 'Dispenser',
}

const AUTOSAVE_DEBOUNCE_MS = 1500
const PAGE_LIMIT = 50

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatUgx(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return `UGX ${Math.round(amount).toLocaleString('en-UG')}`
}

/**
 * Human-friendly relative due date for care tasks.
 *   - past:    "Overdue 3 days"
 *   - today:   "Due today"
 *   - 1 day:   "Due tomorrow"
 *   - <14d:    "Due in 5 days"
 *   - else:    "Due 2026-05-20"
 *
 * Returns '' when value is missing/invalid so the chip is just hidden.
 */
function formatDueAt(value: string | null | undefined): string {
  if (!value) return ''
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return ''
  const now = new Date()
  // Compare at day granularity — overdue-by-2-hours shouldn't say "Overdue 1 day".
  const startOfDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.round((startOfDay(due) - startOfDay(now)) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays)
    return `Overdue ${overdue} day${overdue === 1 ? '' : 's'}`
  }
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays < 14) return `Due in ${diffDays} days`
  return `Due ${formatDate(value)}`
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function PatientHeader({
  patient,
  onEdit,
}: {
  patient: PatientWithDerivedAge
  onEdit: () => void
}) {
  const name =
    [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
    patient.display_name ||
    'Unknown patient'

  const ageLabel = useMemo(() => {
    if (patient.derived_age === null) return 'Age unknown'
    const suffix = patient.dob_precision === 'exact' ? ' yrs' : ' yrs (approx)'
    return `${patient.derived_age}${suffix}`
  }, [patient.derived_age, patient.dob_precision])

  const sexLabel = patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : null
  const guardianLabel = useMemo(() => {
    if (!patient.guardian_name) return null
    const rel = guardianRelationshipLabel(patient.guardian_relationship)
    return rel ? `${patient.guardian_name} (${rel})` : patient.guardian_name
  }, [patient.guardian_name, patient.guardian_relationship])

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          {patient.patient_id && (
            <p className="text-xs text-muted-foreground">#{patient.patient_id}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sexLabel && <Badge variant="info">{sexLabel}</Badge>}
          <Badge variant="info">{ageLabel}</Badge>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
        {patient.village && <span>Village: {patient.village}</span>}
        {patient.parish && <span>Parish: {patient.parish}</span>}
        {patient.subcounty && <span>Subcounty: {patient.subcounty}</span>}
        {patient.district && <span>District: {patient.district}</span>}
        {patient.whatsapp_number && (
          <span className="font-mono">{patient.whatsapp_number}</span>
        )}
        {guardianLabel && <span>Guardian: {guardianLabel}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Latest vitals card
// ---------------------------------------------------------------------------

function VitalRow({
  label,
  value,
  unit,
  at,
}: {
  label: string
  value: string | null
  unit: string
  at: string | null
}) {
  if (!value) {
    return (
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/70 italic">Not yet captured</span>
      </div>
    )
  }
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">
        {value} {unit}
        {at && (
          <span className="text-muted-foreground"> &middot; {formatDate(at)}</span>
        )}
      </span>
    </div>
  )
}

function LatestVitalsCard({ vitals }: { vitals: PatientLatestVitals | null }) {
  const v = vitals ?? {
    weight_kg: null,
    weight_kg_at: null,
    height_cm: null,
    height_cm_at: null,
    temp_c: null,
    temp_c_at: null,
    bp_systolic: null,
    bp_diastolic: null,
    bp_at: null,
    pulse_bpm: null,
    pulse_bpm_at: null,
    resp_rate: null,
    resp_rate_at: null,
    spo2_pct: null,
    spo2_pct_at: null,
    muac_cm: null,
    muac_cm_at: null,
  }

  const bpValue =
    v.bp_systolic !== null && v.bp_diastolic !== null
      ? `${v.bp_systolic}/${v.bp_diastolic}`
      : null

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Latest known vitals
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <VitalRow
          label="Weight"
          value={v.weight_kg !== null ? String(v.weight_kg) : null}
          unit="kg"
          at={v.weight_kg_at}
        />
        <VitalRow
          label="Height"
          value={v.height_cm !== null ? String(v.height_cm) : null}
          unit="cm"
          at={v.height_cm_at}
        />
        <VitalRow
          label="Temperature"
          value={v.temp_c !== null ? String(v.temp_c) : null}
          unit="°C"
          at={v.temp_c_at}
        />
        <VitalRow
          label="Blood pressure"
          value={bpValue}
          unit="mmHg"
          at={v.bp_at}
        />
        <VitalRow
          label="Pulse"
          value={v.pulse_bpm !== null ? String(v.pulse_bpm) : null}
          unit="bpm"
          at={v.pulse_bpm_at}
        />
        <VitalRow
          label="Resp. rate"
          value={v.resp_rate !== null ? String(v.resp_rate) : null}
          unit="bpm"
          at={v.resp_rate_at}
        />
        <VitalRow
          label="SpO₂"
          value={v.spo2_pct !== null ? String(v.spo2_pct) : null}
          unit="%"
          at={v.spo2_pct_at}
        />
        <VitalRow
          label="MUAC"
          value={v.muac_cm !== null ? String(v.muac_cm) : null}
          unit="cm"
          at={v.muac_cm_at}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline event cards
// ---------------------------------------------------------------------------

function VisitCard({ data, eventAt }: { data: VisitEventData; eventAt: string }) {
  const cfg = VISIT_STATUS_CONFIG[data.status] || VISIT_STATUS_CONFIG.error
  const canPrint = ['sent', 'completed'].includes(data.status)
  const printHref = `/dashboard/visits/${data.visit_id}/print`
  const labLabel =
    data.lab_status && data.lab_status !== 'not_ordered'
      ? LAB_STATUS_LABEL[data.lab_status] ?? data.lab_status
      : null
  const pharmLabel =
    data.dispensing_status && data.dispensing_status !== 'not_started'
      ? DISPENSING_STATUS_LABEL[data.dispensing_status] ?? data.dispensing_status
      : data.pharmacy_order_submitted_at || data.medications
        ? 'Pharmacy queued'
        : null
  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors">
      <Link href={`/dashboard/visits/${data.visit_id}`} className="block">
        <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-medium">{formatDate(data.visit_date) || formatDate(eventAt)}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="info">{data.department}</Badge>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.bg} ${cfg.color}`}
            >
              {cfg.label}
            </span>
            {labLabel && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-soft text-slate">
                {labLabel}
                {data.lab_abnormal ? ' · flagged' : ''}
              </span>
            )}
            {pharmLabel && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cobalt-soft text-cobalt">
                {pharmLabel}
              </span>
            )}
          </div>
        </div>
      </div>
      {data.chief_complaint && (
        <p className="text-sm text-muted-foreground mb-1">
          <span className="font-medium text-foreground">CC:</span> {data.chief_complaint}
        </p>
      )}
      {data.diagnosis && (
        <p className="text-sm">
          <span className="font-medium">Dx:</span> {data.diagnosis}
        </p>
      )}
      </Link>
      {canPrint && (
        <a
          href={printHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cobalt hover:underline"
        >
          <Printer className="h-3.5 w-3.5" />
          Print patient slip
        </a>
      )}
    </div>
  )
}

function NoteCard({ data, eventAt }: { data: NoteEventData; eventAt: string }) {
  const cfg = NOTE_STATUS_CONFIG[data.status] || NOTE_STATUS_CONFIG.draft
  const sourceLabel = SOURCE_LABEL[data.source] || data.source
  const preview = data.transcript_preview || ''
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{sourceLabel}</Badge>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.bg} ${cfg.color}`}
          >
            {cfg.label}
          </span>
          {data.signed_at && (
            <span className="text-xs text-muted-foreground">
              signed {formatDateTime(data.signed_at)}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(eventAt)}</span>
      </div>
      {preview ? (
        <p className="text-sm whitespace-pre-wrap line-clamp-5">{preview}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">(empty note)</p>
      )}
      {data.visit_id && (
        <Link
          href={`/dashboard/visits/${data.visit_id}`}
          className="text-xs text-primary hover:underline mt-2 inline-block"
        >
          Open visit
        </Link>
      )}
    </div>
  )
}

function VitalCard({ data, eventAt }: { data: VitalEventData; eventAt: string }) {
  const chips: string[] = []
  if (data.weight_kg !== null) chips.push(`${data.weight_kg} kg`)
  if (data.height_cm !== null) chips.push(`${data.height_cm} cm`)
  if (data.temp_c !== null) chips.push(`${data.temp_c}°C`)
  if (data.bp_systolic !== null && data.bp_diastolic !== null) {
    chips.push(`BP ${data.bp_systolic}/${data.bp_diastolic}`)
  }
  if (data.pulse_bpm !== null) chips.push(`HR ${data.pulse_bpm}`)
  if (data.resp_rate !== null) chips.push(`RR ${data.resp_rate}`)
  if (data.spo2_pct !== null) chips.push(`SpO₂ ${data.spo2_pct}%`)
  if (data.muac_cm !== null) chips.push(`MUAC ${data.muac_cm} cm`)

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge variant="info">Vitals</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(eventAt)}</span>
      </div>
      {chips.length > 0 ? (
        <p className="text-sm">{chips.join(' · ')}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">(no measurements)</p>
      )}
      {data.notes && (
        <p className="text-xs text-muted-foreground mt-1">{data.notes}</p>
      )}
    </div>
  )
}

function PaymentCard({ data, eventAt }: { data: PaymentEventData; eventAt: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge variant="info">Payment</Badge>
        <span className="text-xs text-muted-foreground">{formatDate(eventAt)}</span>
      </div>
      <p className="text-sm font-medium">{formatUgx(data.amount_ugx)}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {data.payment_method.replace('_', ' ')}
        {data.receipt_number && ` · Receipt ${data.receipt_number}`}
        {data.service_type && ` · ${data.service_type}`}
      </p>
    </div>
  )
}

function TaskCard({ data, eventAt }: { data: TaskEventData; eventAt: string }) {
  const typeLabel = TASK_TYPE_LABEL[data.task_type] ?? data.task_type
  const statusCfg = TASK_STATUS_CONFIG[data.status] ?? TASK_STATUS_CONFIG.open
  const dueLabel = formatDueAt(data.due_at)
  const isOverdue =
    data.status !== 'completed' &&
    data.due_at !== null &&
    dueLabel.startsWith('Overdue')
  const roleLabel = data.assignee_role ? ROLE_LABEL[data.assignee_role] : null

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{typeLabel}</Badge>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusCfg.bg} ${statusCfg.color}`}
          >
            {statusCfg.label}
          </span>
          {roleLabel && <Badge variant="neutral">{roleLabel}</Badge>}
          {dueLabel && (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                isOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {dueLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDate(eventAt)}
        </span>
      </div>
      <p className="text-sm font-medium">{data.title}</p>
      {data.description && (
        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
          {data.description}
        </p>
      )}
      {data.visit_id && (
        <Link
          href={`/dashboard/visits/${data.visit_id}`}
          className="text-xs text-primary hover:underline mt-2 inline-block"
        >
          Open visit
        </Link>
      )}
    </div>
  )
}

function TimelineEvent({ event }: { event: PatientTimelineEvent }) {
  switch (event.event_type) {
    case 'visit':
      return <VisitCard data={event.event_data} eventAt={event.event_at} />
    case 'note':
      return <NoteCard data={event.event_data} eventAt={event.event_at} />
    case 'vital':
      return <VitalCard data={event.event_data} eventAt={event.event_at} />
    case 'payment':
      return <PaymentCard data={event.event_data} eventAt={event.event_at} />
    case 'task':
      return <TaskCard data={event.event_data} eventAt={event.event_at} />
  }
}

// ---------------------------------------------------------------------------
// Add-note sheet (patient-only, no visit)
// ---------------------------------------------------------------------------

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

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

function AddPatientNoteSheet({
  open,
  onOpenChange,
  patientId,
  canSign,
  onSigned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  canSign: boolean
  onSigned: () => void
}) {
  // Stable note id for this editing session — first autosave inserts the
  // row, subsequent calls upsert on conflict.
  const noteIdRef = useRef<string>(crypto.randomUUID())

  const [content, setContent] = useState('')
  const [source, setSource] = useState<ProviderNoteSource>('general')
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Autosave plumbing.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef<string>('')
  const lastSavedSourceRef = useRef<ProviderNoteSource>('general')
  const inFlightAutosaveRef = useRef<Promise<void> | null>(null)

  // Reset state when the sheet closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      noteIdRef.current = crypto.randomUUID()
      setContent('')
      setSource('general')
      setAutosaveStatus('idle')
      setError(null)
      lastSavedContentRef.current = ''
      lastSavedSourceRef.current = 'general'
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [open])

  const persistDraft = useCallback(
    async (text: string, src: ProviderNoteSource) => {
      if (text === lastSavedContentRef.current && src === lastSavedSourceRef.current) {
        return
      }
      setAutosaveStatus('saving')
      const promise = (async () => {
        const result = await autosaveDraftPatientNote({
          note_id: noteIdRef.current,
          patient_id: patientId,
          transcript: text,
          source: src,
        })
        if (result.success) {
          lastSavedContentRef.current = text
          lastSavedSourceRef.current = src
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
    [patientId],
  )

  // Debounced autosave on content/source change. Skip very short drafts to
  // avoid creating empty provider_notes rows when the sheet is just opened.
  useEffect(() => {
    if (!open) return
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const trimmed = content.trim()
    if (trimmed.length < 3) return
    if (
      trimmed === lastSavedContentRef.current.trim() &&
      source === lastSavedSourceRef.current
    ) {
      return
    }
    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(content, source)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [content, source, open, persistDraft])

  const flushPendingAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (
      content.trim().length >= 3 &&
      (content !== lastSavedContentRef.current || source !== lastSavedSourceRef.current)
    ) {
      await persistDraft(content, source)
    }
    if (inFlightAutosaveRef.current) {
      try {
        await inFlightAutosaveRef.current
      } catch {
        /* swallow; Sign surfaces its own error */
      }
    }
  }, [content, source, persistDraft])

  const handleSign = () => {
    setError(null)
    const text = content.trim()
    if (text.length < 10) {
      setError('Add a bit more to the note before signing.')
      return
    }
    if (!canSign) {
      setError('Your role cannot sign clinical notes.')
      return
    }
    startTransition(async () => {
      await flushPendingAutosave()
      const result = await signPatientNote({
        note_id: noteIdRef.current,
        patient_id: patientId,
        transcript: text,
        source,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      onSigned()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full sm:!max-w-md md:!max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Add note (no visit)</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="note-source">Source</Label>
            <select
              id="note-source"
              value={source}
              onChange={(e) => setSource(e.target.value as ProviderNoteSource)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={pending}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-content">Note</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Phone follow-up: patient reports symptoms improving on day 3 of AL. Tolerating food. Advised to complete the course."
              className="min-h-[200px] leading-relaxed"
              disabled={pending}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <AutosaveIndicator status={autosaveStatus} />
            <span className="text-xs text-muted-foreground ml-auto">
              {content.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
        </div>

        <div className="border-t border-border p-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSign}
            disabled={pending || content.trim().length < 10 || !canSign}
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
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Add vitals sheet (Phase 4) — patient-only longitudinal capture. Every field
// optional; at least one must be filled. The server action does the same
// check and surfaces a friendly error, so the client validates softly.
// ---------------------------------------------------------------------------

type VitalKey =
  | 'weight_kg'
  | 'height_cm'
  | 'temp_c'
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'pulse_bpm'
  | 'resp_rate'
  | 'spo2_pct'
  | 'muac_cm'

const VITAL_FIELDS: {
  key: VitalKey
  label: string
  unit: string
  min: number
  max: number
  step?: string
}[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', min: 0, max: 300, step: '0.1' },
  { key: 'height_cm', label: 'Height', unit: 'cm', min: 30, max: 250, step: '0.1' },
  { key: 'temp_c', label: 'Temperature', unit: '°C', min: 25, max: 45, step: '0.1' },
  { key: 'bp_systolic', label: 'BP systolic', unit: 'mmHg', min: 30, max: 300 },
  { key: 'bp_diastolic', label: 'BP diastolic', unit: 'mmHg', min: 20, max: 200 },
  { key: 'pulse_bpm', label: 'Pulse', unit: 'bpm', min: 20, max: 300 },
  { key: 'resp_rate', label: 'Resp rate', unit: '/min', min: 5, max: 80 },
  { key: 'spo2_pct', label: 'SpO₂', unit: '%', min: 50, max: 100 },
  { key: 'muac_cm', label: 'MUAC', unit: 'cm', min: 5, max: 50, step: '0.1' },
]

type VitalsForm = Record<VitalKey, string>

const EMPTY_VITALS_FORM: VitalsForm = {
  weight_kg: '',
  height_cm: '',
  temp_c: '',
  bp_systolic: '',
  bp_diastolic: '',
  pulse_bpm: '',
  resp_rate: '',
  spo2_pct: '',
  muac_cm: '',
}

function AddVitalsSheet({
  open,
  onOpenChange,
  patientId,
  canRecord,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  canRecord: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState<VitalsForm>(EMPTY_VITALS_FORM)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_VITALS_FORM)
      setNotes('')
      setError(null)
    }
  }, [open])

  const hasAny = useMemo(
    () =>
      Object.values(form).some((v) => v.trim().length > 0) ||
      notes.trim().length > 0,
    [form, notes],
  )

  const hasMeasurement = useMemo(
    () => Object.values(form).some((v) => v.trim().length > 0),
    [form],
  )

  const handleSave = () => {
    if (!canRecord) {
      setError('Your role cannot record vitals.')
      return
    }
    if (!hasMeasurement) {
      setError('Enter at least one measurement.')
      return
    }
    setError(null)
    const parsed: Partial<Record<VitalKey, number | null>> = {}
    for (const field of VITAL_FIELDS) {
      const raw = form[field.key].trim()
      if (raw === '') {
        parsed[field.key] = null
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        setError(`${field.label} must be a number.`)
        return
      }
      if (n < field.min || n > field.max) {
        setError(
          `${field.label} should be between ${field.min} and ${field.max} ${field.unit}.`,
        )
        return
      }
      parsed[field.key] = n
    }
    startTransition(async () => {
      const result = await recordPatientVitals({
        patient_id: patientId,
        weight_kg: parsed.weight_kg,
        height_cm: parsed.height_cm,
        temp_c: parsed.temp_c,
        bp_systolic: parsed.bp_systolic,
        bp_diastolic: parsed.bp_diastolic,
        pulse_bpm: parsed.pulse_bpm,
        resp_rate: parsed.resp_rate,
        spo2_pct: parsed.spo2_pct,
        muac_cm: parsed.muac_cm,
        notes: notes.trim() ? notes.trim() : null,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Record vitals</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Every field is optional. Capture whatever you measured today.
          </p>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {VITAL_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={`vital-${field.key}`} className="text-xs">
                {field.label} <span className="text-muted-foreground">({field.unit})</span>
              </Label>
              <input
                id={`vital-${field.key}`}
                type="number"
                step={field.step ?? '1'}
                min={field.min}
                max={field.max}
                inputMode="decimal"
                value={form[field.key]}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                disabled={!canRecord || isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1">
          <Label htmlFor="vitals-notes" className="text-xs">
            Notes (optional)
          </Label>
          <Textarea
            id="vitals-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything worth recording about how the readings were taken."
            disabled={!canRecord || isPending}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canRecord || !hasAny || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save vitals'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Root client component
// ---------------------------------------------------------------------------

export function PatientDetailClient({
  staffRole,
  patient: initialPatient,
  latestVitals,
  initialTimeline,
}: {
  staffRole: StaffRole
  patient: PatientWithDerivedAge
  latestVitals: PatientLatestVitals | null
  initialTimeline: PatientTimelineEvent[]
}) {
  const [patient, setPatient] = useState(initialPatient)
  const [events, setEvents] = useState<PatientTimelineEvent[]>(initialTimeline)
  const [loadingMore, setLoadingMore] = useState(false)
  // hasMore is a heuristic: if the last page returned a full PAGE_LIMIT,
  // there may be more. False once a page returns fewer rows.
  const [hasMore, setHasMore] = useState(initialTimeline.length >= PAGE_LIMIT)
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [latestVitalsState, setLatestVitalsState] = useState(latestVitals)

  useEffect(() => {
    setPatient(initialPatient)
  }, [initialPatient])

  const canSign = SIGNING_ROLES.has(staffRole)
  const canRecord = RECORDING_ROLES.has(staffRole)

  const latestPrintableVisit = useMemo(() => {
    const visits = events.filter(
      (e): e is Extract<PatientTimelineEvent, { event_type: 'visit' }> =>
        e.event_type === 'visit' && ['sent', 'completed'].includes(e.event_data.status),
    )
    return (
      visits.sort(
        (a, b) =>
          new Date(b.event_data.visit_date).getTime() -
          new Date(a.event_data.visit_date).getTime(),
      )[0]?.event_data ?? null
    )
  }, [events])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || events.length === 0) return
    setLoadingMore(true)
    try {
      const cursor = events[events.length - 1].event_at
      const next = await getPatientTimeline(patient.id, cursor, PAGE_LIMIT)
      setEvents((prev) => [...prev, ...next])
      if (next.length < PAGE_LIMIT) setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [events, hasMore, loadingMore, patient.id])

  const refresh = useCallback(async () => {
    const fresh = await getPatientTimeline(patient.id, undefined, PAGE_LIMIT)
    setEvents(fresh)
    setHasMore(fresh.length >= PAGE_LIMIT)
  }, [patient.id])

  return (
    <div className="space-y-4">
      <PatientHeader patient={patient} onEdit={() => setEditOpen(true)} />
      <LatestVitalsCard vitals={latestVitalsState} />

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Timeline</h3>
        <div className="flex items-center gap-2">
          {latestPrintableVisit && (
            <Button size="sm" variant="outline" className="gap-2" asChild>
              <a
                href={`/dashboard/visits/${latestPrintableVisit.visit_id}/print`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer className="w-4 h-4" />
                Print slip
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVitalsOpen(true)}
            className="gap-2"
            disabled={!canRecord}
            title={canRecord ? undefined : 'Your role cannot record vitals'}
          >
            <Activity className="w-4 h-4" />
            Record vitals
          </Button>
          <Button
            size="sm"
            onClick={() => setAddNoteOpen(true)}
            className="gap-2"
            disabled={!canSign}
            title={canSign ? undefined : 'Your role cannot sign clinical notes'}
          >
            <Plus className="w-4 h-4" />
            Add note (no visit)
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {events.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Nothing on the timeline yet.
          </p>
        )}
        {events.map((event) => (
          <TimelineEvent key={`${event.event_type}:${event.event_id}`} event={event} />
        ))}
      </div>

      {hasMore && events.length > 0 && (
        <div className="flex justify-center py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}

      <AddPatientNoteSheet
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        patientId={patient.id}
        canSign={canSign}
        onSigned={() => void refresh()}
      />

      <AddVitalsSheet
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        patientId={patient.id}
        canRecord={canRecord}
        onSaved={() => {
          void refresh()
          // The server action already calls revalidatePath; next refresh
          // round-trip will replace latestVitalsState with the server's view.
        }}
      />

      <PatientEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSaved={setPatient}
      />
    </div>
  )
}
