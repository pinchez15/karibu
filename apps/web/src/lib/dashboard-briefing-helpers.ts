/**
 * Pure, server-import-free helpers for the clinic briefing dashboard (Home).
 *
 * Everything here is a plain function over already-loaded data so it is unit
 * testable without touching Supabase. The server loader
 * (`lib/dashboard-briefing.ts`) gathers the raw counts; these helpers turn them
 * into the shapes the presentational dashboard renders.
 */

import type { QueueItem } from '@karibu/shared'
import type { ClinicAppointment } from '@/lib/calendar-events'

// --- Shared shapes ----------------------------------------------------------

export type DaySize = {
  /** Completed/sent visits today PLUS everyone still waiting (whole day so far). */
  visitsToday: number
  waitingNow: number
  withClinicianNow: number
  toFinalize: number
}

export type BriefingStations = {
  opd: { waiting: number; withClinician: number; toFinalize: number }
  /** Active admissions === beds occupied. Discharges-due is not modelled. */
  inpatient: { admitted: number }
  lab: { visitsOnBench: number; openTests: number }
  pharmacy: { toDispense: number; partial: number; returned: number; lowStock: number }
  /** Null when the source is unavailable — the tile is then omitted (no fake zero). */
  anc: { active: number } | null
  hivTb: { hiv: number; tb: number } | null
}

export type MonthToDate = {
  monthLabel: string
  opdVisits: number
  admissions: number
  revenueUgx: number
  chargedUgx: number
  uniquePatients: number
  /** Plain computed date (7th of next month) — no new RPC. */
  hmisDueLabel: string
}

export type AttentionTone = 'amber' | 'cobalt' | 'slate'

export type NeedsAttentionItem = {
  id: string
  /** Higher = more urgent. Drives descending sort. */
  severity: number
  label: string
  detail: string
  href: string
  tone: AttentionTone
}

export type BriefingData = {
  dateLabel: string
  daySize: DaySize
  stations: BriefingStations
  needsAttention: NeedsAttentionItem[]
  /** Already filtered to today..+7 by the loader; grouped by day for the strip. */
  appointments: ClinicAppointment[]
  monthToDate: MonthToDate
}

// --- Queue derivations ------------------------------------------------------

/** Waiting now = queue_status === 'waiting'. */
export function countWaiting(queue: QueueItem[]): number {
  return queue.filter((q) => q.queue_status === 'waiting').length
}

/** With a clinician now = ready_for_doctor OR with_doctor. */
export function countWithClinician(queue: QueueItem[]): number {
  return queue.filter(
    (q) => q.queue_status === 'ready_for_doctor' || q.queue_status === 'with_doctor',
  ).length
}

// --- Needs attention --------------------------------------------------------

export type NeedsAttentionInput = {
  toFinalize: number
  outOfStockCount: number
  outstandingBalances: number
  partialDispenses: number
}

/**
 * Compose the single "needs attention" list, most urgent first. One row per
 * category (aggregate, not per-item) so it stays glanceable. A category with a
 * zero count is dropped entirely — the list never shows empty rows.
 *
 * Ordering (severity, descending) is deliberate and test-locked:
 *   stock-outs (patient safety) > unfinalized notes (HMIS/compliance) >
 *   aging partial dispenses > outstanding balances.
 */
export function buildNeedsAttention(input: NeedsAttentionInput): NeedsAttentionItem[] {
  const rows: NeedsAttentionItem[] = []

  if (input.outOfStockCount > 0) {
    rows.push({
      id: 'stock',
      severity: 40,
      label: 'Out of stock',
      detail: `${input.outOfStockCount} ${input.outOfStockCount === 1 ? 'item' : 'items'} unavailable`,
      href: '/dashboard/stock-overview',
      tone: 'amber',
    })
  }

  if (input.toFinalize > 0) {
    rows.push({
      id: 'finalize',
      severity: 30,
      label: 'Notes to finalize',
      detail: `${input.toFinalize} ${input.toFinalize === 1 ? 'visit needs' : 'visits need'} sign-off`,
      href: '/dashboard/review',
      tone: 'amber',
    })
  }

  if (input.partialDispenses > 0) {
    rows.push({
      id: 'partial',
      severity: 20,
      label: 'Partial dispenses',
      detail: `${input.partialDispenses} ${input.partialDispenses === 1 ? 'prescription' : 'prescriptions'} part-filled`,
      href: '/dashboard/pharmacy',
      tone: 'cobalt',
    })
  }

  if (input.outstandingBalances > 0) {
    rows.push({
      id: 'balances',
      severity: 10,
      label: 'Outstanding balances',
      detail: `${input.outstandingBalances} ${input.outstandingBalances === 1 ? 'patient owes' : 'patients owe'}`,
      href: '/dashboard/billing',
      tone: 'slate',
    })
  }

  return rows.sort((a, b) => b.severity - a.severity)
}

// --- Calendar strip ---------------------------------------------------------

export type DayBucket = {
  key: string
  date: Date
  weekdayLabel: string
  dayNumber: number
  isToday: boolean
  items: ClinicAppointment[]
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Group appointments into consecutive day buckets starting today (local time).
 * Empty days are kept so the strip renders a stable N-column layout. Events in
 * each bucket are sorted by start time. Appointments outside the window are
 * ignored.
 */
export function groupAppointmentsByDay(
  appointments: ClinicAppointment[],
  days = 8,
  now: Date = new Date(),
): DayBucket[] {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const todayKey = dayKey(start)

  const byDay = new Map<string, ClinicAppointment[]>()
  for (const a of appointments) {
    const k = dayKey(new Date(a.scheduled_at))
    const list = byDay.get(k) ?? []
    list.push(a)
    byDay.set(k, list)
  }

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const key = dayKey(date)
    const items = (byDay.get(key) ?? []).sort((a, b) =>
      a.scheduled_at < b.scheduled_at ? -1 : 1,
    )
    return {
      key,
      date,
      weekdayLabel: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday: key === todayKey,
      items,
    }
  })
}

// --- HMIS due date ----------------------------------------------------------

/**
 * HMIS 105 is submitted early the following month; clinics target the 7th.
 * Plain computed date, no RPC. Returns e.g. "7 Aug".
 */
export function hmisDueLabel(now: Date = new Date()): string {
  const due = new Date(now.getFullYear(), now.getMonth() + 1, 7)
  return due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
