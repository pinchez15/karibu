import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { ClinicianDashboard } from './ClinicianDashboard'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import type { OutOfStockItem, RoundsVisit } from './TodayPanels'
import type { QueueItem } from '@karibu/shared'
import { countReviewNotesItems } from '@/lib/review-notes'
import { loadClinicAppointments } from '@/lib/calendar-load'

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
      .eq('active', true),
    supabase
      .from('lab_stock_items')
      .select('test_name, is_unavailable, quantity_on_hand, unit')
      .eq('clinic_id', clinicId)
      .eq('active', true),
  ])
  const items: OutOfStockItem[] = []
  for (const r of pharm.data ?? []) {
    if (r.is_unavailable || Number(r.quantity_on_hand) <= 0) {
      items.push({ label: sentenceCase(r.drug_name as string), detail: r.is_unavailable ? 'Unavailable' : `0 ${r.unit ?? ''}`.trim() })
    }
  }
  for (const r of lab.data ?? []) {
    if (r.is_unavailable || Number(r.quantity_on_hand) <= 0) {
      items.push({ label: `${r.test_name as string} (lab)`, detail: r.is_unavailable ? 'Unavailable' : `0 ${r.unit ?? ''}`.trim() })
    }
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
    console.error('today: rounds', error)
    return []
  }
  return (data ?? []).map((v) => {
    const p = (Array.isArray(v.patient) ? v.patient[0] : v.patient) as
      | { display_name?: string | null; first_name?: string | null; last_name?: string | null }
      | null
    const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null
    const summary = (v.diagnosis as string | null)?.trim() || (v.chief_complaint as string | null)?.trim() || 'No summary'
    return { visit_id: v.id as string, patient_name: name, summary, visit_date: v.visit_date as string }
  })
}

async function getQueueData(clinicId: string): Promise<QueueItem[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_clinic_queue', {
    p_clinic_id: clinicId,
  })

  if (error) {
    console.error('Failed to fetch queue:', error)
    return []
  }

  return (data || []) as QueueItem[]
}

async function getReviewCount(clinicId: string): Promise<number> {
  return countReviewNotesItems(clinicId)
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
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('visit_date', today)
    .in('status', ['sent', 'completed'])

  return count || 0
}

export default async function DashboardPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  // Role-aware landing: lab_tech / dispenser see their own surface, not the
  // clinician dashboard. They can still navigate elsewhere via the sidebar
  // (and /dashboard pages they don't have access to redirect them back here).
  if (staff.role === 'lab_tech') redirect('/dashboard/lab')
  if (staff.role === 'dispenser') redirect('/dashboard/pharmacy')

  const now = new Date()
  const daysBack = now.getDay()
  const daysForward = 13 - now.getDay()

  const [queue, reviewCount, visitsToday, showPhysicalQueue, appointments, outOfStock, rounds] =
    await Promise.all([
      getQueueData(staff.clinic_id),
      getReviewCount(staff.clinic_id),
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
        reviewCount={reviewCount}
        visitsToday={visitsToday}
        showPhysicalQueue={showPhysicalQueue}
        appointments={appointments}
        outOfStock={outOfStock}
        rounds={rounds}
      />
    </>
  )
}
