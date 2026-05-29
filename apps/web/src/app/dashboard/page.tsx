import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { ClinicianDashboard } from './ClinicianDashboard'
import type { QueueItem } from '@karibu/shared'

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
  const supabase = createServiceClient()
  const { count } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('review_status', 'pending_review')

  return count || 0
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

  const [queue, reviewCount, visitsToday, showPhysicalQueue] = await Promise.all([
    getQueueData(staff.clinic_id),
    getReviewCount(staff.clinic_id),
    getVisitsToday(staff.clinic_id),
    getShowPhysicalQueue(staff.clinic_id),
  ])

  return (
    <ClinicianDashboard
      queue={queue}
      reviewCount={reviewCount}
      visitsToday={visitsToday}
      showPhysicalQueue={showPhysicalQueue}
    />
  )
}
