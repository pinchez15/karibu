'use client'

import Link from 'next/link'
import { AlertTriangle, History } from 'lucide-react'

export type TodayAppointment = {
  id: string
  patient_id: string | null
  patient_name: string | null
  event_type: string
  title: string | null
  reason: string | null
  scheduled_at: string
  status: string
}

export type OutOfStockItem = { label: string; detail: string }

export type RoundsVisit = {
  visit_id: string
  patient_name: string | null
  summary: string
  visit_date: string
}

const EVENT_STYLE: Record<string, { label: string; chip: string }> = {
  follow_up: { label: 'Follow-up', chip: 'bg-cobalt-soft text-cobalt' },
  drive: { label: 'Drive', chip: 'bg-accent/15 text-accent' },
  admin: { label: 'Admin', chip: 'bg-muted text-muted-foreground' },
  external_lab_agency: { label: 'Lab / agency', chip: 'bg-amber-soft text-amber-ink' },
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function time(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Morning stand-up board (note #2): a week-ahead CALENDAR of scheduled patients,
// drives, admin work and lab/agency visits; an out-of-stock alert strip; and a
// read-back of yesterday's patients. Walk-ins live in the queue below.
export function TodayPanels({
  appointments,
  outOfStock,
  rounds,
}: {
  appointments: TodayAppointment[]
  outOfStock: OutOfStockItem[]
  rounds: RoundsVisit[]
}) {
  // 7 day columns starting today.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d
  })
  const byDay = new Map<string, TodayAppointment[]>()
  for (const a of appointments) {
    const k = dayKey(new Date(a.scheduled_at))
    const list = byDay.get(k) ?? []
    list.push(a)
    byDay.set(k, list)
  }

  return (
    <div className="mb-5 space-y-3">
      {outOfStock.length > 0 && (
        <div className="rounded-xl border border-amber-soft bg-amber-soft/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-amber-ink">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">Out of stock ({outOfStock.length})</span>
            <span className="truncate text-xs text-amber-ink/80">
              {outOfStock.slice(0, 6).map((o) => o.label).join(' · ')}
              {outOfStock.length > 6 ? ` +${outOfStock.length - 6} more` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Week calendar */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-line-soft px-4 py-2.5 text-sm font-semibold">This week</div>
        <div className="grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-7 sm:divide-x sm:divide-y-0">
          {days.map((d, i) => {
            const events = (byDay.get(dayKey(d)) ?? []).sort((a, b) =>
              a.scheduled_at < b.scheduled_at ? -1 : 1,
            )
            const isToday = i === 0
            return (
              <div key={dayKey(d)} className={`min-h-[7rem] p-2 ${isToday ? 'bg-cobalt-soft/15' : ''}`}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-cobalt' : 'text-body'}`}>
                    {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{d.getDate()}</span>
                </div>
                <div className="space-y-1">
                  {events.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/60">—</span>
                  ) : (
                    events.map((a) => {
                      const style = EVENT_STYLE[a.event_type] ?? EVENT_STYLE.admin
                      const label = a.patient_name || a.title || style.label
                      const chip = (
                        <div className={`rounded px-1.5 py-1 text-[11px] leading-tight ${style.chip}`}>
                          <span className="block font-medium truncate">{label}</span>
                          <span className="block opacity-80">{time(a.scheduled_at)} · {style.label}</span>
                        </div>
                      )
                      return a.patient_id ? (
                        <Link key={a.id} href={`/dashboard/patients/${a.patient_id}`} className="block">
                          {chip}
                        </Link>
                      ) : (
                        <div key={a.id}>{chip}</div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rounds — yesterday's patients, for learning + follow-up */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cobalt" />
            <h3 className="text-sm font-semibold">Seen yesterday</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{rounds.length}</span>
        </div>
        {rounds.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">No patients seen yesterday.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto">
            {rounds.map((r) => (
              <li key={r.visit_id}>
                <Link href={`/dashboard/visits/${r.visit_id}`} className="block px-4 py-2 text-[13px] hover:bg-secondary/40">
                  <span className="font-medium">{r.patient_name || 'Unknown patient'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
