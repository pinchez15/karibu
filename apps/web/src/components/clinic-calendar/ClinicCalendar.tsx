'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type { EventClickArg, DatesSetArg, PluginDef } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listAppointmentsInRange } from '@/app/dashboard/calendar/actions'
import {
  CLINIC_EVENT_META,
  type ClinicAppointment,
  toFullCalendarEvent,
} from '@/lib/calendar-events'
import { AddCalendarEventForm } from './AddCalendarEventForm'
import './clinic-calendar.css'

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false })

const loadDayGrid = () =>
  import('@fullcalendar/daygrid').then((m) => m.default)

const loadInteraction = () =>
  import('@fullcalendar/interaction').then((m) => m.default)

type ClinicCalendarVariant = 'preview' | 'full'

export function ClinicCalendar({
  initialAppointments,
  variant = 'full',
}: {
  initialAppointments: ClinicAppointment[]
  variant?: ClinicCalendarVariant
}) {
  const isPreview = variant === 'preview'
  const [appointments, setAppointments] = useState(initialAppointments)
  const [dayGridPlugin, setDayGridPlugin] = useState<PluginDef | null>(null)
  const [interactionPlugin, setInteractionPlugin] = useState<PluginDef | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addDate, setAddDate] = useState<Date | undefined>()
  const [selectedEvent, setSelectedEvent] = useState<ClinicAppointment | null>(null)
  const [, startRefresh] = useTransition()
  const rangeRef = useRef<{ from: string; to: string } | null>(null)

  useEffect(() => {
    void loadDayGrid().then(setDayGridPlugin)
    if (!isPreview) void loadInteraction().then(setInteractionPlugin)
  }, [isPreview])

  const events = useMemo(() => appointments.map(toFullCalendarEvent), [appointments])

  const refreshRange = useCallback((from: Date, to: Date) => {
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
      if (isPreview) return
      refreshRange(arg.start, arg.end)
    },
    [isPreview, refreshRange],
  )

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setAddDate(arg.date)
    setShowAddForm(true)
    setSelectedEvent(null)
  }, [])

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const match = appointments.find((a) => a.id === arg.event.id)
      setSelectedEvent(match ?? null)
      setShowAddForm(false)
    },
    [appointments],
  )

  const handleCreated = useCallback(() => {
    setShowAddForm(false)
    if (rangeRef.current) {
      refreshRange(new Date(rangeRef.current.from), new Date(rangeRef.current.to))
    }
  }, [refreshRange])

  const plugins = useMemo(() => {
    if (!dayGridPlugin) return null
    if (isPreview) return [dayGridPlugin]
    if (!interactionPlugin) return null
    return [dayGridPlugin, interactionPlugin]
  }, [dayGridPlugin, interactionPlugin, isPreview])

  const previewRange = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 14)
    return { start, end }
  }, [])

  if (!plugins) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Loading calendar…
      </div>
    )
  }

  return (
    <div className={isPreview ? 'space-y-0' : 'space-y-3'}>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">
              {isPreview ? 'Next two weeks' : 'Clinic calendar'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isPreview
                ? 'Upcoming follow-ups, outreach days, and clinic events'
                : 'Schedule follow-ups, outreach, reporting, and lab runs'}
            </p>
          </div>
          {isPreview ? (
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold text-cobalt hover:bg-cobalt-soft/30 transition-colors"
            >
              Open calendar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setAddDate(new Date())
                setShowAddForm(true)
                setSelectedEvent(null)
              }}
            >
              <Plus className="h-4 w-4" />
              Add event
            </Button>
          )}
        </div>

        <div className={`clinic-calendar px-2 pb-3 pt-1 ${isPreview ? 'clinic-calendar--preview' : ''}`}>
          <FullCalendar
            plugins={plugins}
            initialView="twoWeek"
            initialDate={isPreview ? previewRange.start : undefined}
            validRange={isPreview ? { start: previewRange.start, end: previewRange.end } : undefined}
            views={{
              twoWeek: {
                type: 'dayGrid',
                duration: { weeks: 2 },
                buttonText: '2 weeks',
              },
            }}
            headerToolbar={
              isPreview
                ? false
                : {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'twoWeek,dayGridMonth',
                  }
            }
            height={isPreview ? 280 : 'auto'}
            fixedWeekCount={false}
            dayMaxEvents={isPreview ? 2 : 4}
            events={events}
            datesSet={handleDatesSet}
            dateClick={isPreview ? undefined : handleDateClick}
            eventClick={handleEventClick}
            nowIndicator={!isPreview}
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

      {!isPreview && showAddForm && (
        <AddCalendarEventForm
          defaultDate={addDate}
          onCreated={handleCreated}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {selectedEvent && !showAddForm && (
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
            {selectedEvent.patient_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/patients/${selectedEvent.patient_id}`}>
                  Open patient chart
                </Link>
              </Button>
            )}
            {isPreview && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/calendar">Manage on calendar</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
