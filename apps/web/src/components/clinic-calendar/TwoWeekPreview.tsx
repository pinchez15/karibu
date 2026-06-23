'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  CLINIC_EVENT_META,
  type ClinicAppointment,
  appointmentTitle,
} from '@/lib/calendar-events'
import './clinic-calendar.css'

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeLabel(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function startOfWeekSunday(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

export function TwoWeekPreview({ appointments }: { appointments: ClinicAppointment[] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekStart = startOfWeekSunday(today)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const byDay = new Map<string, ClinicAppointment[]>()
  for (const a of appointments) {
    const k = dayKey(new Date(a.scheduled_at))
    const list = byDay.get(k) ?? []
    list.push(a)
    byDay.set(k, list)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Next two weeks</h2>
          <p className="text-xs text-muted-foreground">
            Upcoming follow-ups, outreach days, and clinic events
          </p>
        </div>
        <Link
          href="/dashboard/calendar"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold text-cobalt hover:bg-cobalt-soft/30 transition-colors"
        >
          Open calendar
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-7 border-b border-line-soft bg-secondary/30">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div
            key={label}
            className="border-r border-line-soft px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-line-soft">
        {days.map((d) => {
          const events = (byDay.get(dayKey(d)) ?? []).sort((a, b) =>
            a.scheduled_at < b.scheduled_at ? -1 : 1,
          )
          const isToday = dayKey(d) === dayKey(today)
          return (
            <div
              key={dayKey(d)}
              className={`min-h-[5.5rem] border-b border-line-soft p-2 ${isToday ? 'calendar-today-bg' : 'bg-card'}`}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span
                  className={
                    isToday
                      ? 'calendar-today-date text-[11px] tabular-nums'
                      : 'text-[11px] font-semibold tabular-nums text-body'
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {events.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/50">—</span>
                ) : (
                  events.slice(0, 3).map((a) => {
                    const meta = CLINIC_EVENT_META[a.event_type] ?? CLINIC_EVENT_META.admin
                    const chip = (
                      <div
                        className="rounded px-1.5 py-1 text-[10px] leading-tight text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        <span className="block font-medium truncate">{appointmentTitle(a)}</span>
                        <span className="block opacity-90">
                          {timeLabel(a.scheduled_at)} · {meta.shortLabel}
                        </span>
                      </div>
                    )
                    return a.patient_id ? (
                      <Link
                        key={a.id}
                        href={`/dashboard/patients/${a.patient_id}`}
                        className="block"
                      >
                        {chip}
                      </Link>
                    ) : (
                      <div key={a.id}>{chip}</div>
                    )
                  })
                )}
                {events.length > 3 && (
                  <Link
                    href="/dashboard/calendar"
                    className="text-[10px] font-medium text-cobalt hover:underline"
                  >
                    +{events.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          )
        })}
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
  )
}
