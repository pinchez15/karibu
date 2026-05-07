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

async function getPendingSyncCount(_clinicId: string): Promise<number> {
  // Field-device sync state lives on the Android client. No server-side count
  // today; placeholder returns 0 until that telemetry pipeline is wired up.
  return 0
}

export default async function DashboardPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const [queue, reviewCount, visitsToday, pendingSync] = await Promise.all([
    getQueueData(staff.clinic_id),
    getReviewCount(staff.clinic_id),
    getVisitsToday(staff.clinic_id),
    getPendingSyncCount(staff.clinic_id),
  ])

  return (
    <ClinicianDashboard
      queue={queue}
      reviewCount={reviewCount}
      visitsToday={visitsToday}
      pendingSync={pendingSync}
    />
  )
}
