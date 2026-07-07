import { createServiceClient } from '@/lib/supabase'
import { startOfTodayInTimezoneIso } from '@/lib/clinic-time'
import { measureServerLoader, PERF_LOADER } from '@/lib/server-timing'
import type { PrescriptionOrderLine, PharmacyQueueTab } from '@karibu/shared'
import { type DispensingRow } from './pharmacy-shared'

export type PharmacyStationRow = DispensingRow & {
  prescription_lines: PrescriptionOrderLine[]
  dispensed_at: string | null
}

export type PharmacyStockItem = {
  id: string
  drug_name: string
  drug_code: string
  strength: string | null
  formulation: string
  unit: string
  quantity_on_hand: number
}

/**
 * Discriminated result for the stock list. The picker degrades gracefully on
 * failure (dispensing still works without stock decrement), so callers get a
 * readable error instead of a thrown server-action error — which production
 * redacts to an opaque "Server Components render" digest.
 */
export type PharmacyStockResult =
  | { ok: true; items: PharmacyStockItem[] }
  | { ok: false; error: string }

const TERMINAL = ['dispensed', 'partial', 'out_of_stock'] as const
const ACTIVE = ['not_started', 'in_progress', 'partial', 'out_of_stock'] as const
const RETURNED = ['returned'] as const

export type PharmacyTabFilter = {
  /** dispensing_status values this tab includes. */
  statuses: string[]
  /** When set, only rows with dispensed_at >= this ISO instant are included. */
  dispensedAfter?: string
}

/**
 * Pure, unit-testable mapping from a tab to its query predicate (WP1 D1/D3).
 *
 * - `to_dispense` = the ACTIVE set (not_started, in_progress, partial,
 *   out_of_stock). A multi-line script therefore stays on this tab until every
 *   line resolves — it never "disappears" mid-work. No date bound.
 * - `done_today` = the TERMINAL set, bounded to work dispensed since the
 *   clinic's local midnight (Africa/Kampala), not the server's UTC midnight.
 *
 * `nowIso` is injectable only for tests; production always uses the live clock.
 */
export function pharmacyTabFilter(
  tab: PharmacyQueueTab,
  dispensedAfter: string = startOfTodayInTimezoneIso(),
): PharmacyTabFilter {
  if (tab === 'done_today') {
    return { statuses: [...TERMINAL], dispensedAfter }
  }
  if (tab === 'returned_to_clinician') {
    return { statuses: [...RETURNED] }
  }
  return { statuses: [...ACTIVE] }
}

export async function getPharmacyStationQueue(
  clinicId: string,
  tab: PharmacyQueueTab,
): Promise<PharmacyStationRow[]> {
  return measureServerLoader(PERF_LOADER.pharmacyQueue, () =>
    getPharmacyStationQueueImpl(clinicId, tab),
  )
}

async function getPharmacyStationQueueImpl(
  clinicId: string,
  tab: PharmacyQueueTab,
): Promise<PharmacyStationRow[]> {
  const supabase = createServiceClient()

  let query = supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      diagnosis,
      chief_complaint,
      medications,
      dispensing_status,
      dispense_notes,
      pharmacy_order_submitted_at,
      dispensed_at,
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name,
        date_of_birth,
        sex,
        whatsapp_number
      )
    `)
    .eq('clinic_id', clinicId)
    .not('pharmacy_order_submitted_at', 'is', null)
    .not('medications', 'is', null)
    .neq('medications', '')
    .order('pharmacy_order_submitted_at', { ascending: true })
    .limit(100)

  const filter = pharmacyTabFilter(tab)
  query = query.in('dispensing_status', filter.statuses)
  if (filter.dispensedAfter) {
    query = query.gte('dispensed_at', filter.dispensedAfter)
  }

  const { data: visits, error } = await query
  if (error) {
    console.error('getPharmacyStationQueue', error)
    return []
  }

  const visitRows = (visits ?? []) as unknown as Array<
    DispensingRow & { dispensed_at: string | null }
  >
  if (visitRows.length === 0) return []

  const visitIds = visitRows.map((v) => v.id)
  const { data: lines, error: linesErr } = await supabase
    .from('prescription_orders')
    .select('*')
    .in('visit_id', visitIds)
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelled')
    .order('sort_order', { ascending: true })

  if (linesErr) {
    console.error('getPharmacyStationQueue lines', linesErr)
  }

  // WP3 D2: how much has already been dispensed per line, so the worksheet can
  // default a re-dispense to the REMAINING quantity (not the full prescribed
  // amount) and show "already dispensed X of Y". Mirrors the DB's incremental
  // SUM in billing_charge_pharmacy_line (dispensed + partially_dispensed).
  const lineIds = (lines ?? []).map((l) => (l as PrescriptionOrderLine).id)
  const dispensedByLine = new Map<string, number>()
  if (lineIds.length > 0) {
    const { data: records, error: recErr } = await supabase
      .from('dispense_records')
      .select('prescription_order_id, quantity_dispensed, line_status')
      .in('prescription_order_id', lineIds)
      .eq('clinic_id', clinicId)
    if (recErr) {
      console.error('getPharmacyStationQueue dispense_records', recErr)
    }
    for (const r of records ?? []) {
      const status = r.line_status as string
      if (status !== 'dispensed' && status !== 'partially_dispensed') continue
      const key = r.prescription_order_id as string
      const prev = dispensedByLine.get(key) ?? 0
      dispensedByLine.set(key, prev + Number(r.quantity_dispensed ?? 0))
    }
  }

  const byVisit = new Map<string, PrescriptionOrderLine[]>()
  for (const line of (lines ?? []) as PrescriptionOrderLine[]) {
    const list = byVisit.get(line.visit_id) ?? []
    list.push({ ...line, quantity_dispensed_so_far: dispensedByLine.get(line.id) ?? 0 })
    byVisit.set(line.visit_id, list)
  }

  return visitRows.map((row) => ({
    ...row,
    prescription_lines: byVisit.get(row.id) ?? [],
  }))
}

export async function getPharmacyTabCounts(clinicId: string): Promise<Record<PharmacyQueueTab, number>> {
  const supabase = createServiceClient()

  const toDispense = pharmacyTabFilter('to_dispense')
  const doneToday = pharmacyTabFilter('done_today')

  const returned = pharmacyTabFilter('returned_to_clinician')

  const [toDispenseRes, returnedRes, doneRes] = await Promise.all([
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .not('medications', 'is', null)
      .neq('medications', '')
      .in('dispensing_status', toDispense.statuses),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .in('dispensing_status', returned.statuses),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .not('medications', 'is', null)
      .neq('medications', '')
      .in('dispensing_status', doneToday.statuses)
      .gte('dispensed_at', doneToday.dispensedAfter!),
  ])

  return {
    to_dispense: toDispenseRes.count ?? 0,
    returned_to_clinician: returnedRes.count ?? 0,
    done_today: doneRes.count ?? 0,
  }
}

export { ACTIVE, RETURNED, TERMINAL }
