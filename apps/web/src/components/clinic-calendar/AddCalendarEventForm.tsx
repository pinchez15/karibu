'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClinicEvent } from '@/app/dashboard/calendar/actions'
import { searchPatients } from '@/app/dashboard/actions'
import { CLINIC_EVENT_META, type ClinicEventType } from '@/lib/calendar-events'
import type { Patient } from '@karibu/shared'
import { cn } from '@/lib/utils'

const EVENT_TYPES = Object.keys(CLINIC_EVENT_META) as ClinicEventType[]

export function AddCalendarEventForm({
  defaultDate,
  onCreated,
  onCancel,
}: {
  defaultDate?: Date
  onCreated: () => void
  onCancel: () => void
}) {
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

  useEffect(() => {
    const d = defaultDate ?? new Date()
    setDate(d.toISOString().slice(0, 10))
  }, [defaultDate])

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
        const scheduledAt = new Date(`${date}T${time}:00`)
        if (Number.isNaN(scheduledAt.getTime())) {
          setError('Invalid date or time.')
          return
        }
        start(async () => {
          const result = await createClinicEvent({
            event_type: eventType,
            scheduled_at: scheduledAt.toISOString(),
            title: needsTitle ? title : undefined,
            reason: reason || undefined,
            patient_id: patientId ?? undefined,
          })
          if (!result.success) {
            setError(result.error)
            return
          }
          onCreated()
        })
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Add calendar event</h3>
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
          <Input
            id="cal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={eventType === 'drive' ? 'Immunization drive' : 'Event name'}
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
          placeholder="Reason, location, or instructions"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Saving…' : 'Add to calendar'}
      </Button>
    </form>
  )
}
