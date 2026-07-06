'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createClinicEvent,
  deleteClinicEvent,
  updateClinicEvent,
} from '@/app/dashboard/calendar/actions'
import { searchPatients } from '@/app/dashboard/actions'
import {
  CLINIC_EVENT_META,
  EVENT_TITLE_PRESETS,
  clinicFieldsToUtcIso,
  clinicTodayStr,
  utcToClinicFields,
  type ClinicAppointment,
  type ClinicEventType,
} from '@/lib/calendar-events'
import type { Patient } from '@karibu/shared'
import { cn } from '@/lib/utils'

const EVENT_TYPES = Object.keys(CLINIC_EVENT_META) as ClinicEventType[]

export function AddCalendarEventForm({
  defaultDate,
  event,
  onSaved,
  onDeleted,
  onCancel,
}: {
  /** Clinic-local date "YYYY-MM-DD" to prefill when adding. */
  defaultDate?: string
  /** When set, form edits an existing calendar event. */
  event?: ClinicAppointment
  onSaved: () => void
  onDeleted?: () => void
  onCancel: () => void
}) {
  const isEdit = Boolean(event)
  const [eventType, setEventType] = useState<ClinicEventType>('drive')
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientHits, setPatientHits] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState<string | null>(null)
  const [patientLabel, setPatientLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [deleting, startDelete] = useTransition()

  useEffect(() => {
    if (event) {
      const fields = utcToClinicFields(event.scheduled_at)
      setEventType(event.event_type)
      setTitle(event.title ?? '')
      setReason(event.reason ?? '')
      setDate(fields.date)
      setTime(fields.time)
      setPatientId(event.patient_id)
      setPatientLabel(event.patient_name)
      return
    }
    setEventType('drive')
    setTitle('')
    setReason('')
    setDate(defaultDate ?? clinicTodayStr())
    setTime('09:00')
    setPatientId(null)
    setPatientLabel(null)
  }, [defaultDate, event])

  useEffect(() => {
    if (patientQuery.trim().length < 2) {
      setPatientHits([])
      return
    }
    const t = setTimeout(() => {
      void searchPatients(patientQuery.trim()).then(setPatientHits)
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery])

  const needsPatient = eventType === 'follow_up'
  const needsTitle = eventType !== 'follow_up'

  return (
    <form
      className="rounded-xl border border-border bg-card p-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        if (!date || !time) {
          setError('Pick a date and time.')
          return
        }
        const scheduledIso = clinicFieldsToUtcIso(date, time)
        if (Number.isNaN(Date.parse(scheduledIso))) {
          setError('Invalid date or time.')
          return
        }
        start(async () => {
          const body = {
            event_type: eventType,
            scheduled_at: scheduledIso,
            title: needsTitle ? title : undefined,
            reason: reason || undefined,
            patient_id: patientId ?? undefined,
          }
          const result = isEdit
            ? await updateClinicEvent(event!.id, body)
            : await createClinicEvent(body)
          if (!result.success) {
            setError(result.error)
            return
          }
          onSaved()
        })
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {isEdit ? 'Edit calendar event' : 'Add calendar event'}
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((type) => {
          const meta = CLINIC_EVENT_META[type]
          const active = eventType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => setEventType(type)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-semibold border transition-colors',
                active ? 'text-white border-transparent' : 'border-border bg-background text-body',
              )}
              style={active ? { backgroundColor: meta.color } : undefined}
            >
              {meta.shortLabel}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{CLINIC_EVENT_META[eventType].hint}</p>

      {needsTitle && (
        <div className="space-y-1.5">
          <Label htmlFor="cal-title">Title</Label>
          {(EVENT_TITLE_PRESETS[eventType]?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TITLE_PRESETS[eventType]!.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium text-body hover:bg-secondary/70 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
          <Input
            id="cal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              eventType === 'drive'
                ? 'e.g. Immunization drive (EPI)'
                : eventType === 'admin'
                  ? 'e.g. HMIS 105 reporting deadline'
                  : 'Event name'
            }
            required
          />
        </div>
      )}

      {needsPatient && (
        <div className="space-y-1.5">
          <Label>Patient</Label>
          {patientId && patientLabel ? (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{patientLabel}</span>
              <button
                type="button"
                className="text-xs text-cobalt hover:underline"
                onClick={() => {
                  setPatientId(null)
                  setPatientLabel(null)
                  setPatientQuery('')
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Input
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="Search patient name…"
              />
              {patientHits.length > 0 && (
                <ul className="max-h-36 overflow-y-auto rounded-md border border-border divide-y">
                  {patientHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50"
                        onClick={() => {
                          setPatientId(p.id)
                          setPatientLabel(
                            p.display_name ||
                              [p.first_name, p.last_name].filter(Boolean).join(' ') ||
                              'Patient',
                          )
                          setPatientHits([])
                          setPatientQuery('')
                        }}
                      >
                        {p.display_name || `${p.first_name} ${p.last_name}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cal-date">Date</Label>
          <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-time">Time</Label>
          <Input id="cal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cal-reason">Notes (optional)</Label>
        <Input
          id="cal-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Village, VHT name, transport notes, or clinical reason"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || deleting} className="w-full sm:w-auto">
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add to calendar'}
        </Button>
        {isEdit && onDeleted && (
          <Button
            type="button"
            variant="outline"
            disabled={pending || deleting}
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (
                !window.confirm(
                  'Remove this event from the calendar? This cannot be undone.',
                )
              ) {
                return
              }
              setError(null)
              startDelete(async () => {
                const result = await deleteClinicEvent(event!.id)
                if (!result.success) {
                  setError(result.error)
                  return
                }
                onDeleted()
              })
            }}
          >
            {deleting ? 'Removing…' : 'Delete event'}
          </Button>
        )}
      </div>
    </form>
  )
}
