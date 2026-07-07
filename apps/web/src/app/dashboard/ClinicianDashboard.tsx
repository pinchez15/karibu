'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { ClinicianSearchBar } from '@/components/clinician-search-bar'
import { WebTopBar } from '@/components/web-shell'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { TodayPanels, type TodayAppointment, type OutOfStockItem, type RoundsVisit } from './TodayPanels'
import { formatClinicDate } from '@/lib/format-clinic-date'
import { cn } from '@/lib/utils'
import { filterQueueBySearch, type QueueItem } from '@karibu/shared'

const QUEUE_GRID = 'grid-cols-[0.5fr_1.5fr_1fr_1.6fr_0.8fr_1fr]'

/**
 * Karibu clinician dashboard — designed top-level view.
 * Replaces QueueDashboardClient with the layout from karibu_design_files/web-clinician.jsx.
 *
 * Action buttons (claim / take / hand off) move INTO visit-detail per the
 * design's information-dense, status-driven approach. The dashboard becomes a
 * scannable map of the day, not a workflow board.
 */

interface ClinicianDashboardProps {
  queue: QueueItem[]
  /** Completed-today visits, purged from the active queue (WP2 D10). */
  doneToday?: QueueItem[]
  reviewCount: number
  /** Visits seen today (status='completed' or 'sent' on visit_date=today). */
  visitsToday?: number
  /** Average visit time today, in minutes (lightweight metric, can default later). */
  avgVisitMinutes?: number
  /** When false, hide the legacy physical queue table (chart-first workflow). */
  showPhysicalQueue?: boolean
  /** Morning stand-up panels (#2/#9). */
  appointments?: TodayAppointment[]
  outOfStock?: OutOfStockItem[]
  rounds?: RoundsVisit[]
}

export function ClinicianDashboard({
  queue,
  doneToday = [],
  reviewCount,
  visitsToday = 0,
  avgVisitMinutes,
  showPhysicalQueue = true,
  appointments = [],
  outOfStock = [],
  rounds = [],
}: ClinicianDashboardProps) {
  const waiting = queue.length
  const avgLabel = avgVisitMinutes
    ? `${Math.floor(avgVisitMinutes)}m ${Math.round((avgVisitMinutes - Math.floor(avgVisitMinutes)) * 60)}s`
    : '—'

  const [search, setSearch] = useState('')
  const [doneOpen, setDoneOpen] = useState(false)
  const filteredQueue = useMemo(
    () =>
      filterQueueBySearch(queue, search, (item) => ({
        name: item.patient_name,
        todayNumber: item.queue_position,
        extra: [item.patient_phone],
      })),
    [queue, search],
  )

  return (
    <>
      <WebTopBar
        title="Today at the clinic"
        subtitle={formatClinicDate()}
        subtitleMeta={false}
        actions={<ClinicianSearchBar />}
      />

      <div className="p-6 overflow-auto flex-1">
        <TodayPanels appointments={appointments} outOfStock={outOfStock} rounds={rounds} />

        <div className="grid grid-cols-4 gap-3 mb-5">
          <Stat label="VISITS TODAY" value={String(visitsToday + waiting)} delta={null} />
          <Stat label="WAITING" value={String(waiting)} delta={null} />
          <Stat label="AVG TIME" value={avgLabel} delta={null} />
          <Stat
            label="TO FINALIZE"
            value={String(reviewCount)}
            delta={reviewCount ? 'notes' : null}
            deltaAmber
          />
        </div>

        {showPhysicalQueue ? (
          <div className="bg-card border border-border rounded-xl opacity-90">
            <div className="px-[18px] py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-line-soft">
              <div>
                <div className="text-sm font-semibold">Physical queue</div>
                <div className="text-xs text-muted-foreground">
                  Operational view · {waiting} {waiting === 1 ? 'patient' : 'patients'} · use
                  patient search for chart-first workflow
                </div>
              </div>
              <div className="relative w-full max-w-[240px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by name or #"
                  className="h-8 pl-8 text-xs"
                  aria-label="Filter queue by name or today's number"
                />
              </div>
            </div>

            {/* Header */}
            <div className={cn('grid gap-3 px-[18px] py-2 kh-meta border-b border-line-soft', QUEUE_GRID)}>
              <span>#</span>
              <span>PATIENT</span>
              <span>STATUS</span>
              <span>COMPLAINT</span>
              <span>WAIT</span>
              <span>SEEN BY</span>
            </div>

            {queue.length === 0 ? (
              <div className="px-[18px] py-12 text-center text-muted-foreground text-sm">
                No patients in the queue right now.
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="px-[18px] py-12 text-center text-muted-foreground text-sm">
                No patients match &ldquo;{search}&rdquo;.
              </div>
            ) : (
              filteredQueue.map((item, i) => {
                const last = i === filteredQueue.length - 1
                const status = mapStatus(item)
                const cc = item.chief_complaint || '—'
                const seenBy = item.doctor_name ?? item.nurse_name ?? '—'
                const wait = item.wait_minutes >= 1
                  ? `${Math.floor(item.wait_minutes)}m`
                  : '—'
                const isUrgent = item.priority === 'urgent' || item.priority === 'high'

                return (
                  <Link
                    key={item.visit_id}
                    href={`/dashboard/visits/${item.visit_id}`}
                    className={cn(
                      'grid gap-3 px-[18px] py-3 text-[13px] items-center transition-colors hover:bg-background/60',
                      QUEUE_GRID,
                      !last && 'border-b border-line-soft',
                      isUrgent && 'bg-amber-soft/30',
                    )}
                  >
                    <div className="font-mono text-[15px] font-semibold tabular-nums">
                      {item.queue_position || '—'}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {item.patient_name ?? 'Unknown patient'}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {item.patient_id.slice(0, 8)} · {item.patient_phone}
                      </div>
                    </div>
                    <div>
                      <StatusPill kind={status.kind} label={status.label} />
                    </div>
                    <div className="text-body">{cc}</div>
                    <div className="font-mono text-[12px] text-body">{wait}</div>
                    <div className={seenBy === '—' ? 'text-muted-foreground' : 'text-body'}>
                      {seenBy}
                    </div>
                  </Link>
                )
              })
            )}

            {doneToday.length > 0 && (
              <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between border-t border-line-soft px-[18px] py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                    <span>Done today · {doneToday.length}</span>
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', doneOpen && 'rotate-180')}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {doneToday.map((item) => {
                    const seenBy = item.doctor_name ?? item.nurse_name ?? '—'
                    return (
                      <Link
                        key={item.visit_id}
                        href={`/dashboard/visits/${item.visit_id}`}
                        className={cn(
                          'grid gap-3 px-[18px] py-2.5 text-[13px] items-center border-t border-line-soft/60 opacity-70 transition-colors hover:bg-background/60 hover:opacity-100',
                          QUEUE_GRID,
                        )}
                      >
                        <div className="font-mono text-[13px] tabular-nums text-muted-foreground">
                          {item.queue_position || '—'}
                        </div>
                        <div className="font-medium">{item.patient_name ?? 'Unknown patient'}</div>
                        <div>
                          <StatusPill kind="waiting" label="Done" />
                        </div>
                        <div className="text-body">{item.chief_complaint || '—'}</div>
                        <div className="text-muted-foreground">—</div>
                        <div className={seenBy === '—' ? 'text-muted-foreground' : 'text-body'}>
                          {seenBy}
                        </div>
                      </Link>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}

interface StatProps {
  label: string
  value: string
  delta: string | null
  deltaAmber?: boolean
}

function Stat({ label, value, delta, deltaAmber }: StatProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-[18px]">
      <div className="kh-meta">{label}</div>
      <div className="text-[30px] font-semibold mt-1.5 tracking-tight flex items-baseline gap-2">
        {value}
        {delta && (
          <span
            className={cn(
              'text-[12px] font-semibold px-1.5 py-px rounded',
              deltaAmber ? 'bg-amber-soft text-amber-ink' : 'bg-green-soft text-green',
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

type StatusKind = 'urgent' | 'vitals' | 'in-note' | 'waiting' | 'lab'

function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const palette: Record<StatusKind, string> = {
    urgent: 'bg-amber-soft text-amber-ink',
    vitals: 'bg-cobalt-soft text-cobalt',
    'in-note': 'bg-cobalt-soft text-cobalt',
    waiting: 'bg-line-soft text-muted-foreground',
    lab: 'bg-slate-soft text-slate',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold', palette[kind])}>
      {label}
    </span>
  )
}

function mapStatus(item: QueueItem): { kind: StatusKind; label: string } {
  if (item.priority === 'urgent' || item.priority === 'high') {
    return { kind: 'urgent', label: 'Urgent' }
  }
  switch (item.queue_status) {
    case 'with_nurse': return { kind: 'vitals', label: 'Vitals' }
    case 'ready_for_doctor': return { kind: 'waiting', label: 'Ready' }
    case 'with_doctor': return { kind: 'in-note', label: 'In note' }
    case 'completed': return { kind: 'waiting', label: 'Done' }
    case 'cancelled': return { kind: 'waiting', label: 'Cancelled' }
    case 'waiting':
    default:
      return { kind: 'waiting', label: 'Waiting' }
  }
}

