/**
 * Server loader for the clinic briefing dashboard (Home).
 *
 * Whole-clinic, NOT role-scoped: every desk's numbers land here so staff see
 * "big day vs small day" at a glance. Reuses the existing data sources rather
 * than rebuilding them; only lightweight count-only helpers (lab bench, stock
 * outs) are added here where no exported helper existed.
 */

import { createServiceClient } from '@/lib/supabase'
import { formatClinicDate, clinicTodayIso } from '@/lib/format-clinic-date'
import { getClinicSimpleMetrics } from '@/lib/clinic-simple-metrics'
import { countReviewNotesItems } from '@/lib/review-notes'
import { loadClinicAppointments } from '@/lib/calendar-load'
import { computeBalance } from '@/lib/billing-balance'
import { loadActiveAdmissions } from '@/app/dashboard/inpatient/actions'
import { getPharmacyTabCounts } from '@/app/dashboard/pharmacy/pharmacy-data'
import { listPatientBalances } from '@/app/dashboard/billing/actions'
import { loadActivePregnancies } from '@/app/dashboard/anc/actions'
import { loadHivTbRegistry } from '@/app/dashboard/hiv-tb/actions'
import {
  countOpenLabTests,
  isLabQueueVisit,
  mergeLabTestResults,
  type LabTestResultRow,
  type QueueItem,
} from '@karibu/shared'
import {
  buildNeedsAttention,
  countWaiting,
  countWithClinician,
  hmisDueLabel,
  type BriefingData,
} from '@/lib/dashboard-briefing-helpers'

/** Clinic-wide queue (SECURITY DEFINER RPC — same source as OPD Today). */
async function getQueue(clinicId: string): Promise<QueueItem[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_clinic_queue', { p_clinic_id: clinicId })
  if (error) {
    console.error('briefing: queue', error)
    return []
  }
  return (data ?? []) as QueueItem[]
}

/** Visits seen today (status sent/completed) — mirrors OPD getVisitsToday(). */
async function getVisitsTodayCompleted(clinicId: string): Promise<number> {
  const supabase = createServiceClient()
  const { count } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('visit_date', clinicTodayIso())
    .in('status', ['sent', 'completed'])
  return count ?? 0
}

/**
 * Lab bench, count-only. Mirrors lab/page.tsx getLabQueue's SQL filter + the
 * shared isLabQueueVisit / countOpenLabTests post-filter, but only returns the
 * two counts the tile needs (visits on bench + open tests across them).
 */
async function getLabBench(clinicId: string): Promise<{ visitsOnBench: number; openTests: number }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('visits')
    .select('tests_ordered, lab_status, lab_test_results')
    .eq('clinic_id', clinicId)
    .not('tests_ordered', 'is', null)
    .neq('tests_ordered', '')
    .in('lab_status', ['pending', 'running'])
    .limit(200)
  if (error) {
    console.error('briefing: lab bench', error)
    return { visitsOnBench: 0, openTests: 0 }
  }
  let visitsOnBench = 0
  let openTests = 0
  for (const row of data ?? []) {
    const visit = row as {
      tests_ordered: string | null
      lab_status: string | null
      lab_test_results: LabTestResultRow[] | null
    }
    if (!isLabQueueVisit(visit)) continue
    visitsOnBench += 1
    openTests += countOpenLabTests(mergeLabTestResults(visit.tests_ordered, visit.lab_test_results ?? []))
  }
  return { visitsOnBench, openTests }
}

/**
 * Stock-outs split by store. Same query shape as OPD getOutOfStock(), but kept
 * separate so the pharmacy tile's low-stock badge is pharmacy-only while the
 * needs-attention row can span both pharmacy + lab.
 */
async function getStockOuts(clinicId: string): Promise<{ pharmacy: number; lab: number }> {
  const supabase = createServiceClient()
  const [pharm, lab] = await Promise.all([
    supabase
      .from('pharmacy_stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .or('is_unavailable.eq.true,quantity_on_hand.lte.0'),
    supabase
      .from('lab_stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .or('is_unavailable.eq.true,quantity_on_hand.lte.0'),
  ])
  return { pharmacy: pharm.count ?? 0, lab: lab.count ?? 0 }
}

/** Patients with a positive remaining balance (via the shared computeBalance). */
async function countOutstandingBalances(): Promise<number> {
  const rows = await listPatientBalances()
  return rows.filter((r) => computeBalance([{ amount_ugx: r.charged }], [{ amount_ugx: r.paid }]).remaining > 0)
    .length
}

/** ANC / HIV-TB caseload — null-safe: a failed load surfaces as null → tile omitted. */
async function getAncActive(clinicId: string): Promise<{ active: number } | null> {
  try {
    const rows = await loadActivePregnancies(clinicId)
    return { active: rows.length }
  } catch (e) {
    console.error('briefing: anc', e)
    return null
  }
}

async function getHivTbActive(clinicId: string): Promise<{ hiv: number; tb: number } | null> {
  try {
    const reg = await loadHivTbRegistry(clinicId)
    return { hiv: reg.hiv.length, tb: reg.tb.length }
  } catch (e) {
    console.error('briefing: hiv-tb', e)
    return null
  }
}

export async function loadBriefing(clinicId: string): Promise<BriefingData> {
  const now = new Date()

  const [
    queue,
    visitsTodayCompleted,
    toFinalize,
    metrics,
    appointments,
    admissions,
    pharmacyCounts,
    labBench,
    stockOuts,
    outstandingBalances,
    anc,
    hivTb,
  ] = await Promise.all([
    getQueue(clinicId),
    getVisitsTodayCompleted(clinicId),
    countReviewNotesItems(clinicId),
    getClinicSimpleMetrics(clinicId),
    loadClinicAppointments(clinicId, { daysBack: 0, daysForward: 7 }),
    loadActiveAdmissions(clinicId),
    getPharmacyTabCounts(clinicId),
    getLabBench(clinicId),
    getStockOuts(clinicId),
    countOutstandingBalances(),
    getAncActive(clinicId),
    getHivTbActive(clinicId),
  ])

  const waitingNow = countWaiting(queue)
  const withClinicianNow = countWithClinician(queue)

  const needsAttention = buildNeedsAttention({
    toFinalize,
    outOfStockCount: stockOuts.pharmacy + stockOuts.lab,
    outstandingBalances,
    partialDispenses: pharmacyCounts.partial,
  })

  return {
    dateLabel: formatClinicDate(now),
    daySize: {
      visitsToday: visitsTodayCompleted + waitingNow,
      waitingNow,
      withClinicianNow,
      toFinalize,
    },
    stations: {
      opd: { waiting: waitingNow, withClinician: withClinicianNow, toFinalize },
      inpatient: { admitted: admissions.length },
      lab: labBench,
      pharmacy: {
        toDispense: pharmacyCounts.to_dispense,
        partial: pharmacyCounts.partial,
        returned: pharmacyCounts.returned_to_clinician,
        lowStock: stockOuts.pharmacy,
      },
      anc,
      hivTb,
    },
    needsAttention,
    appointments,
    monthToDate: {
      monthLabel: metrics.monthLabel,
      opdVisits: metrics.month.opdVisits,
      admissions: metrics.month.admissions,
      revenueUgx: metrics.month.revenueUgx,
      chargedUgx: metrics.month.chargedUgx,
      uniquePatients: metrics.month.uniquePatients,
      hmisDueLabel: hmisDueLabel(now),
    },
  }
}

// Re-export the caller-facing type for convenience.
export type { BriefingData } from '@/lib/dashboard-briefing-helpers'
