import { createServiceClient } from '@/lib/supabase'
import { pharmacyTabForVisit } from '@/lib/validators/prescription'
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

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function getPharmacyStationQueue(
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

  if (tab === 'waiting') {
    query = query.eq('dispensing_status', 'not_started')
  } else if (tab === 'in_progress') {
    query = query.eq('dispensing_status', 'in_progress')
  } else {
    query = query
      .in('dispensing_status', [...TERMINAL])
      .gte('dispensed_at', startOfTodayIso())
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

  const byVisit = new Map<string, PrescriptionOrderLine[]>()
  for (const line of (lines ?? []) as PrescriptionOrderLine[]) {
    const list = byVisit.get(line.visit_id) ?? []
    list.push(line)
    byVisit.set(line.visit_id, list)
  }

  return visitRows.map((row) => ({
    ...row,
    prescription_lines: byVisit.get(row.id) ?? [],
  }))
}

export async function getPharmacyTabCounts(clinicId: string): Promise<Record<PharmacyQueueTab, number>> {
  const supabase = createServiceClient()
  const today = startOfTodayIso()

  const [waiting, inProgress, done] = await Promise.all([
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .eq('dispensing_status', 'not_started'),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .eq('dispensing_status', 'in_progress'),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('pharmacy_order_submitted_at', 'is', null)
      .in('dispensing_status', [...TERMINAL])
      .gte('dispensed_at', today),
  ])

  return {
    waiting: waiting.count ?? 0,
    in_progress: inProgress.count ?? 0,
    done_today: done.count ?? 0,
  }
}

export function filterRowsForTab(rows: PharmacyStationRow[], tab: PharmacyQueueTab): PharmacyStationRow[] {
  return rows.filter((row) => pharmacyTabForVisit(row.dispensing_status, row.dispensed_at) === tab)
}

export { ACTIVE, TERMINAL }
