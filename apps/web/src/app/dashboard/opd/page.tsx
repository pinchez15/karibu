import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { measureServerLoader, PERF_LOADER } from '@/lib/server-timing'
import { ClinicianDashboard } from '../ClinicianDashboard'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import type { OutOfStockItem, RoundsVisit } from '../TodayPanels'
import type { QueueItem } from '@karibu/shared'
import { countReviewNotesItems } from '@/lib/review-notes'
import { loadClinicAppointments } from '@/lib/calendar-load'
import { clinicTodayIso } from '@/lib/format-clinic-date'

function sentenceCase(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t
}

async function getOutOfStock(clinicId: string): Promise<OutOfStockItem[]> {
  const supabase = createServiceClient()
  const [pharm, lab] = await Promise.all([
    supabase
      .from('pharmacy_stock_items')
      .select('drug_name, is_unavailable, quantity_on_hand, unit')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .or('is_unavailable.eq.true,quantity_on_hand.lte.0')
      .limit(50),
    supabase
      .from('lab_stock_items')
      .select('test_name, is_unavailable, quantity_on_hand, unit')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .or('is_unavailable.eq.true,quantity_on_hand.lte.0')
      .limit(50),
  ])
  const items: OutOfStockItem[] = []
  for (const r of pharm.data ?? []) {
    items.push({
      label: sentenceCase(r.drug_name as string),
      detail: r.is_unavailable ? 'Unavailable' : `0 ${r.unit ?? ''}`.trim(),
    })
  }
  for (const r of lab.data ?? []) {
    items.push({
      label: `${r.test_name as string} (lab)`,
      detail: r.is_unavailable ? 'Unavailable' : `0 ${r.unit ?? ''}`.trim(),
    })
  }
  return items
}

async function getRounds(clinicId: string): Promise<RoundsVisit[]> {
  const supabase = createServiceClient()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = y.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('visits')
    .select('id, visit_date, diagnosis, chief_complaint, patient:patients(display_name, first_name, last_name)')
    .eq('clinic_id', clinicId)
    .eq('visit_date', yesterday)
    .in('status', ['sent', 'completed'])
    .order('updated_at', { ascending: false })
    .limit(25)
  if (error) {
    console.error('opd today: rounds', error)
    return []
  }
  return (data ?? []).map((v) => {
    const p = (Array.isArray(v.patient) ? v.patient[0] : v.patient) as
      | { display_name?: string | null; first_name?: string | null; last_name?: string | null }
      | null
    const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null
    const summary =
      (v.diagnosis as string | null)?.trim() ||
      (v.chief_complaint as string | null)?.trim() ||
      'No summary'
    return {
      visit_id: v.id as string,
      patient_name: name,
      summary,
      visit_date: v.visit_date as string,
    }
  })
}

async function getQueueData(clinicId: string): Promise<QueueItem[]> {
  return measureServerLoader(PERF_LOADER.opdQueue, async () => {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_clinic_queue', {
      p_clinic_id: clinicId,
    })

    if (error) {
      console.error('Failed to fetch queue:', error)
      return []
    }

    return (data || []) as QueueItem[]
  })
}

// WP2 D10: completed patients are purged from the default queue view
// (get_clinic_queue now excludes them). They still matter for a glanceable
// "Done today N" collapsed section, so load them separately here.
async function getDoneTodayQueue(clinicId: string): Promise<QueueItem[]> {
  const supabase = createServiceClient()
  const today = clinicTodayIso()
  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      patient_id,
      queue_position,
      queue_status,
      priority,
      chief_complaint,
      checked_in_at,
      doctor_id,
      patient:patients!inner(first_name, last_name, whatsapp_number),
      doctor:staff!visits_doctor_id_fkey(display_name)
    `)
    .eq('clinic_id', clinicId)
    .eq('visit_date', today)
    .eq('queue_status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Failed to fetch done-today queue:', error)
    return []
  }

  return (data ?? []).map((v) => {
    const p = (Array.isArray(v.patient) ? v.patient[0] : v.patient) as
      | { first_name?: string | null; last_name?: string | null; whatsapp_number?: string | null }
      | null
    const d = (Array.isArray(v.doctor) ? v.doctor[0] : v.doctor) as
      | { display_name?: string | null }
      | null
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null
    return {
      visit_id: v.id as string,
      patient_id: v.patient_id as string,
      patient_name: name,
      patient_phone: p?.whatsapp_number ?? '',
      queue_position: (v.queue_position as number | null) ?? 0,
      queue_status: v.queue_status as QueueItem['queue_status'],
      priority: v.priority as QueueItem['priority'],
      chief_complaint: (v.chief_complaint as string | null) ?? null,
      checked_in_at: (v.checked_in_at as string | null) ?? '',
      nurse_id: null,
      nurse_name: null,
      doctor_id: (v.doctor_id as string | null) ?? null,
      doctor_name: d?.display_name ?? null,
      wait_minutes: 0,
    } satisfies QueueItem
  })
}

async function getShowPhysicalQueue(clinicId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinics')
    .select('workflow_config')
    .eq('id', clinicId)
    .maybeSingle()
  const config = data?.workflow_config as { show_physical_queue_filter?: boolean } | null
  return config?.show_physical_queue_filter !== false
}

async function getVisitsToday(clinicId: string): Promise<number> {
  const supabase = createServiceClient()
  const today = clinicTodayIso()
  const { count } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('visit_date', today)
    .in('status', ['sent', 'completed'])

  return count || 0
}

export default async function OpdTodayPage() {
  return measureServerLoader(PERF_LOADER.opdPage, async () => {
    const staff = await getStaff()
    if (!staff) redirect('/')

    const now = new Date()
    const daysBack = now.getDay()
    const daysForward = 13 - now.getDay()

    const [queue, doneToday, reviewCount, visitsToday, showPhysicalQueue, appointments, outOfStock, rounds] =
      await Promise.all([
        getQueueData(staff.clinic_id),
        getDoneTodayQueue(staff.clinic_id),
        countReviewNotesItems(staff.clinic_id),
        getVisitsToday(staff.clinic_id),
        getShowPhysicalQueue(staff.clinic_id),
        loadClinicAppointments(staff.clinic_id, { daysBack, daysForward }),
        getOutOfStock(staff.clinic_id),
        getRounds(staff.clinic_id),
      ])

    return (
      <>
        <RealtimeRefresher clinicId={staff.clinic_id} />
        <ClinicianDashboard
          queue={queue}
          doneToday={doneToday}
          reviewCount={reviewCount}
          visitsToday={visitsToday}
          showPhysicalQueue={showPhysicalQueue}
          appointments={appointments}
          outOfStock={outOfStock}
          rounds={rounds}
        />
      </>
    )
  })
}
