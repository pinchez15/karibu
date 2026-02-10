import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { QueueDashboardClient } from './QueueDashboardClient'
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

export default async function DashboardPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const [queue, reviewCount] = await Promise.all([
    getQueueData(staff.clinic_id),
    getReviewCount(staff.clinic_id),
  ])

  return (
    <QueueDashboardClient
      initialQueue={queue}
      reviewCount={reviewCount}
      clinicId={staff.clinic_id}
      staffId={staff.id}
      staffRole={staff.role}
      staffName={staff.display_name}
    />
  )
}
