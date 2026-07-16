import { startOfTodayInTimezoneIso } from '@/lib/clinic-time'
import type { PharmacyQueueTab } from '@karibu/shared'

// Pure pharmacy-queue tab logic — NO server-only imports, so client components
// (PharmacyStationClient, the e2e station demo) can import it. The server data
// layer (pharmacy-data.ts) re-exports everything here for its own callers.

// PHARM-5 queue de-dup — every dispensing_status maps to EXACTLY ONE tab.
// Before this fix `partial` (and `out_of_stock`) sat in both ACTIVE and TERMINAL,
// so a partial visit showed in both "To dispense" and "Done today".
//
// - ACTIVE (To dispense): work not yet started/finished. `out_of_stock` lives
//   here (NOT in Done today): an all-out-of-stock visit is UNFINISHED work that
//   becomes dispensable the moment stock arrives (the RPC keeps its line
//   dispensable, and PrescriptionWorksheet keeps it editable). Parking it in
//   Done today would hide unfinished work and it would fall off at the day
//   boundary.
// - PARTIAL (Partial): a genuine partial balance — some dispensed, a balance
//   still owed. Its own tab so "dispense the rest" is a first-class action and
//   the visit never disappears mid-work.
// - TERMINAL (Done today): fully `dispensed` only.
export const TERMINAL = ['dispensed'] as const
export const ACTIVE = ['not_started', 'in_progress', 'out_of_stock'] as const
export const PARTIAL = ['partial'] as const
export const RETURNED = ['returned'] as const

export type PharmacyTabFilter = {
  /** dispensing_status values this tab includes. */
  statuses: string[]
  /** When set, only rows with dispensed_at >= this ISO instant are included. */
  dispensedAfter?: string
}

/**
 * Pure, unit-testable mapping from a tab to its query predicate (WP1 D1/D3).
 *
 * - `to_dispense` = the ACTIVE set (not_started, in_progress, out_of_stock). A
 *   multi-line script stays here until it either fully dispenses or acquires a
 *   partial balance (then it moves to `partial`). No date bound.
 * - `partial` = the PARTIAL set (`partial`) — a balance is owed. No date bound.
 * - `done_today` = the TERMINAL set (`dispensed`), bounded to work dispensed
 *   since the clinic's local midnight (Africa/Kampala), not the server's UTC
 *   midnight.
 *
 * `dispensedAfter` is injectable only for tests; production uses the live clock.
 */
export function pharmacyTabFilter(
  tab: PharmacyQueueTab,
  dispensedAfter: string = startOfTodayInTimezoneIso(),
): PharmacyTabFilter {
  if (tab === 'done_today') {
    return { statuses: [...TERMINAL], dispensedAfter }
  }
  if (tab === 'partial') {
    return { statuses: [...PARTIAL] }
  }
  if (tab === 'returned_to_clinician') {
    return { statuses: [...RETURNED] }
  }
  return { statuses: [...ACTIVE] }
}

/**
 * Optimistic client-side tab membership (PHARM-5). After a dispense the station
 * decides whether the just-updated visit still belongs on the tab the operator
 * is looking at, or should drop off (it moved to another tab). Mirrors
 * `pharmacyTabFilter` minus the date bound (the row is on-screen because it was
 * already in the tab). `done_today` is read-only, so it never re-evaluates.
 */
export function dispensingStatusOnTab(
  tab: PharmacyQueueTab,
  dispensingStatus: string,
): boolean {
  if (tab === 'partial') return (PARTIAL as readonly string[]).includes(dispensingStatus)
  if (tab === 'returned_to_clinician')
    return (RETURNED as readonly string[]).includes(dispensingStatus)
  if (tab === 'done_today') return (TERMINAL as readonly string[]).includes(dispensingStatus)
  return (ACTIVE as readonly string[]).includes(dispensingStatus)
}
