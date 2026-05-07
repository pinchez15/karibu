'use client'

import Link from 'next/link'
import { Search, Filter, Sparkles } from 'lucide-react'
import { WebTopBar } from '@/components/web-shell'
import { cn } from '@/lib/utils'
import type { QueueItem } from '@karibu/shared'

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
  reviewCount: number
  /** Visits seen today (status='completed' or 'sent' on visit_date=today). */
  visitsToday?: number
  /** Average visit time today, in minutes (lightweight metric, can default later). */
  avgVisitMinutes?: number
  /** Pending sync count from field devices, surfaced in the right column. */
  pendingSync?: number
}

const FORMATTED_TODAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date()).toUpperCase().replace(/\s/g, ' · ')

export function ClinicianDashboard({
  queue,
  reviewCount,
  visitsToday = 0,
  avgVisitMinutes,
  pendingSync = 0,
}: ClinicianDashboardProps) {
  const waiting = queue.length
  const avgLabel = avgVisitMinutes
    ? `${Math.floor(avgVisitMinutes)}m ${Math.round((avgVisitMinutes - Math.floor(avgVisitMinutes)) * 60)}s`
    : '—'

  return (
    <>
      <WebTopBar
        title="Today at the clinic"
        subtitle={FORMATTED_TODAY}
        actions={
          <>
            <div className="bg-background border border-border rounded-md px-3 py-2 flex items-center gap-2 text-muted-foreground text-[13px] w-[280px]">
              <Search className="h-4 w-4" />
              <span>Search patients, visits, codes</span>
              <span className="ml-auto font-mono text-[11px] bg-card border border-border px-1.5 py-px rounded">
                ⌘K
              </span>
            </div>
            <Link
              href="/dashboard"
              className="bg-cobalt text-white border-0 rounded-md px-3.5 py-[9px] font-semibold text-[13px] hover:bg-cobalt-deep transition-colors"
            >
              + New visit
            </Link>
          </>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <Stat label="VISITS TODAY" value={String(visitsToday + waiting)} delta={null} />
          <Stat label="WAITING" value={String(waiting)} delta={null} />
          <Stat label="AVG TIME" value={avgLabel} delta={null} />
          <Stat
            label="TO REVIEW"
            value={String(reviewCount)}
            delta={reviewCount ? 'AI' : null}
            deltaAmber
          />
        </div>

        <div className="grid grid-cols-[1.6fr_1fr] gap-4">
          {/* Queue table */}
          <div className="bg-card border border-border rounded-xl">
            <div className="px-[18px] py-3.5 flex items-center justify-between border-b border-line-soft">
              <div>
                <div className="text-sm font-semibold">Queue</div>
                <div className="text-xs text-muted-foreground">
                  {waiting} {waiting === 1 ? 'patient' : 'patients'} · ordered by wait time
                </div>
              </div>
              <button className="bg-background text-body border border-border rounded-md px-2.5 py-[5px] text-xs font-medium inline-flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Filter
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[1.5fr_1fr_1.6fr_0.8fr_1fr] gap-3 px-[18px] py-2 kh-meta border-b border-line-soft">
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
            ) : (
              queue.map((item, i) => {
                const last = i === queue.length - 1
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
                      'grid grid-cols-[1.5fr_1fr_1.6fr_0.8fr_1fr] gap-3 px-[18px] py-3 text-[13px] items-center transition-colors hover:bg-background/60',
                      !last && 'border-b border-line-soft',
                      isUrgent && 'bg-amber-soft/30',
                    )}
                  >
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
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4">
            {/* AI review queue */}
            <div className="bg-card border border-amber/40 rounded-xl p-[18px]">
              <div className="flex items-center gap-1.5 text-amber kh-meta mb-2">
                <Sparkles className="h-3.5 w-3.5" /> AI REVIEW QUEUE
              </div>
              <div className="text-[22px] font-semibold tracking-tight">
                {reviewCount} {reviewCount === 1 ? 'note structured' : 'notes structured'}
              </div>
              <div className="text-[13px] text-muted-foreground mt-1">
                {reviewCount === 0
                  ? 'No pending reviews. AI suggestions will appear here.'
                  : 'Confirm SOAP and HMIS codes before submitting.'}
              </div>
              <Link
                href="/dashboard/review"
                className="block w-full mt-3.5 bg-amber text-amber-ink rounded-md py-2.5 font-semibold text-[13px] text-center hover:bg-amber/90 transition-colors"
              >
                Open review queue
              </Link>
            </div>

            {/* Sync status */}
            <div className="bg-card border border-border rounded-xl p-[18px]">
              <div className="kh-meta mb-2">OFFLINE SYNC</div>
              <div className="text-[13px] text-body mb-3">
                {pendingSync === 0
                  ? 'All field devices synced.'
                  : `${pendingSync} ${pendingSync === 1 ? 'visit' : 'visits'} from field devices waiting to push.`}
              </div>
              <div className="flex flex-col gap-1.5 text-[12px]">
                <SyncRow label="Pixel devices" status="Synced 09:38" tone="green" />
                <SyncRow label="Galaxy A14" status={`${pendingSync} pending`} tone={pendingSync ? 'amber' : 'green'} />
              </div>
            </div>
          </div>
        </div>
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

function SyncRow({ label, status, tone }: { label: string; status: string; tone: 'green' | 'amber' }) {
  return (
    <div className="flex justify-between text-body">
      <span>{label}</span>
      <span className={cn('font-mono', tone === 'amber' ? 'text-amber' : 'text-green')}>{status}</span>
    </div>
  )
}
