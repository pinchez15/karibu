'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type { EventClickArg, DatesSetArg, PluginDef } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listAppointmentsInRange, deleteClinicEvent } from '@/app/dashboard/calendar/actions'
import {
  CLINIC_EVENT_META,
  type ClinicAppointment,
  toFullCalendarEvent,
} from '@/lib/calendar-events'
import { AddCalendarEventForm } from './AddCalendarEventForm'
import './clinic-calendar.css'

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false })

const loadDayGrid = () => import('@fullcalendar/daygrid').then((m) => m.default)
const loadInteraction = () => import('@fullcalendar/interaction').then((m) => m.default)

export function ClinicCalendar({
  initialAppointments,
}: {
  initialAppointments: ClinicAppointment[]
}) {
  const [appointments, setAppointments] = useState(initialAppointments)
  const [dayGridPlugin, setDayGridPlugin] = useState<PluginDef | null>(null)
  const [interactionPlugin, setInteractionPlugin] = useState<PluginDef | null>(null)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [addDate, setAddDate] = useState<Date | undefined>()
  const [selectedEvent, setSelectedEvent] = useState<ClinicAppointment | null>(null)
  const [, startRefresh] = useTransition()
  const [, startDelete] = useTransition()
  const rangeRef = useRef<{ from: string; to: string } | null>(null)

  useEffect(() => {
    void loadDayGrid().then(setDayGridPlugin)
    void loadInteraction().then(setInteractionPlugin)
  }, [])

  const events = useMemo(() => appointments.map(toFullCalendarEvent), [appointments])

  const refreshRange = useCallback((from?: Date, to?: Date) => {
    if (!from || !to) {
      if (!rangeRef.current) return
      from = new Date(rangeRef.current.from)
      to = new Date(rangeRef.current.to)
    }
    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    rangeRef.current = { from: fromIso, to: toIso }
    startRefresh(async () => {
      const result = await listAppointmentsInRange(fromIso, toIso)
      if (result.data) setAppointments(result.data)
    })
  }, [])

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      refreshRange(arg.start, arg.end)
    },
    [refreshRange],
  )

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setAddDate(arg.date)
    setFormMode('add')
    setSelectedEvent(null)
  }, [])

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const match = appointments.find((a) => a.id === arg.event.id)
      setSelectedEvent(match ?? null)
      setFormMode(null)
    },
    [appointments],
  )

  const handleSaved = useCallback(() => {
    setFormMode(null)
    setSelectedEvent(null)
    refreshRange()
  }, [refreshRange])

  const plugins = useMemo(() => {
    if (!dayGridPlugin || !interactionPlugin) return null
    return [dayGridPlugin, interactionPlugin]
  }, [dayGridPlugin, interactionPlugin])

  if (!plugins) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Loading calendar…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">Clinic calendar</h2>
            <p className="text-xs text-muted-foreground">
              Schedule follow-ups, outreach, reporting, and lab runs
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setAddDate(new Date())
              setFormMode('add')
              setSelectedEvent(null)
            }}
          >
            <Plus className="h-4 w-4" />
            Add event
          </Button>
        </div>

        <div className="clinic-calendar px-2 pb-3 pt-1">
          <FullCalendar
            plugins={plugins}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: '',
            }}
            height="auto"
            fixedWeekCount={false}
            dayMaxEvents={3}
            moreLinkClick="popover"
            events={events}
            datesSet={handleDatesSet}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            nowIndicator
            eventDisplay="block"
            selectable={false}
            editable={false}
          />
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line-soft px-4 py-2.5">
          {(Object.keys(CLINIC_EVENT_META) as Array<keyof typeof CLINIC_EVENT_META>).map(
            (key) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-body">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CLINIC_EVENT_META[key].color }}
                />
                {CLINIC_EVENT_META[key].label}
              </span>
            ),
          )}
        </div>
      </div>

      {formMode === 'add' && (
        <AddCalendarEventForm
          defaultDate={addDate}
          onSaved={handleSaved}
          onCancel={() => setFormMode(null)}
        />
      )}

      {formMode === 'edit' && selectedEvent && (
        <AddCalendarEventForm
          event={selectedEvent}
          onSaved={handleSaved}
          onDeleted={handleSaved}
          onCancel={() => setFormMode(null)}
        />
      )}

      {selectedEvent && formMode !== 'edit' && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{toFullCalendarEvent(selectedEvent).title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(selectedEvent.scheduled_at).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' · '}
                {CLINIC_EVENT_META[selectedEvent.event_type]?.label}
              </p>
              {selectedEvent.reason && (
                <p className="mt-2 text-body">{selectedEvent.reason}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
              Close
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFormMode('edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (
                  !window.confirm(
                    'Remove this event from the calendar? This cannot be undone.',
                  )
                ) {
                  return
                }
                startDelete(async () => {
                  const result = await deleteClinicEvent(selectedEvent.id)
                  if (result.success) {
                    setSelectedEvent(null)
                    refreshRange()
                  }
                })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            {selectedEvent.patient_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/patients/${selectedEvent.patient_id}`}>
                  Open patient chart
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
