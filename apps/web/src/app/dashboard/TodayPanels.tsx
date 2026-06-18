'use client'

import Link from 'next/link'
import { CalendarDays, AlertTriangle, History } from 'lucide-react'

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

export type OutOfStockItem = {
  label: string
  detail: string
}

export type RoundsVisit = {
  visit_id: string
  patient_name: string | null
  summary: string
  visit_date: string
}

const EVENT_LABEL: Record<string, string> = {
  follow_up: 'Follow-up',
  drive: 'Outreach drive',
  admin: 'Admin',
  external_lab_agency: 'Lab / agency visit',
}

function time(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// The "morning stand-up" panels for the Today board (#2, #9): what's scheduled,
// what can't be dispensed, and a read-back of yesterday's patients for learning
// and follow-up. Rendered above the operational queue.
export function TodayPanels({
  appointments,
  outOfStock,
  rounds,
}: {
  appointments: TodayAppointment[]
  outOfStock: OutOfStockItem[]
  rounds: RoundsVisit[]
}) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Calendar / agenda */}
      <Panel title="On the calendar" icon={CalendarDays} count={appointments.length}>
        {appointments.length === 0 ? (
          <Empty>Nothing scheduled today.</Empty>
        ) : (
          appointments.map((a) => {
            const label = a.patient_name || a.title || EVENT_LABEL[a.event_type] || 'Event'
            const sub = a.patient_name ? a.reason || EVENT_LABEL[a.event_type] : EVENT_LABEL[a.event_type]
            const inner = (
              <div className="flex items-start justify-between gap-2 px-3 py-2 text-[13px] hover:bg-secondary/40">
                <span className="min-w-0">
                  <span className="font-medium">{label}</span>
                  {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{time(a.scheduled_at)}</span>
              </div>
            )
            return (
              <li key={a.id}>
                {a.patient_id ? <Link href={`/dashboard/patients/${a.patient_id}`}>{inner}</Link> : inner}
              </li>
            )
          })
        )}
      </Panel>

      {/* Out-of-stock alerts */}
      <Panel title="Out of stock" icon={AlertTriangle} count={outOfStock.length} warn>
        {outOfStock.length === 0 ? (
          <Empty>Pharmacy and lab fully stocked.</Empty>
        ) : (
          outOfStock.map((o, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0 truncate font-medium">{o.label}</span>
              <span className="shrink-0 text-xs text-amber-ink">{o.detail}</span>
            </li>
          ))
        )}
      </Panel>

      {/* Rounds — yesterday's patients */}
      <Panel title="Seen yesterday" icon={History} count={rounds.length}>
        {rounds.length === 0 ? (
          <Empty>No patients seen yesterday.</Empty>
        ) : (
          rounds.map((r) => (
            <li key={r.visit_id}>
              <Link
                href={`/dashboard/visits/${r.visit_id}`}
                className="block px-3 py-2 text-[13px] hover:bg-secondary/40"
              >
                <span className="font-medium">{r.patient_name || 'Unknown patient'}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.summary}</span>
              </Link>
            </li>
          ))
        )}
      </Panel>
    </div>
  )
}

function Panel({
  title,
  icon: Icon,
  count,
  warn,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${warn && count > 0 ? 'text-amber-ink' : 'text-cobalt'}`} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span
          className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${
            warn && count > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-background text-muted-foreground'
          }`}
        >
          {count}
        </span>
      </div>
      <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto">{children}</ul>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</li>
}
