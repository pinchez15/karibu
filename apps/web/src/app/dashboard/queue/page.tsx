import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { QueueBoard } from '@/components/dashboard/QueueBoard'
import { CheckInForm } from '@/components/dashboard/CheckInForm'
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

export default async function QueuePage() {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const queue = await getQueueData(staff.clinic_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Patient Queue</h2>
          <p className="text-gray-600 mt-1">Manage today's patient flow</p>
        </div>
        <CheckInForm clinicId={staff.clinic_id} />
      </div>

      <QueueBoard
        initialQueue={queue}
        clinicId={staff.clinic_id}
        staffId={staff.id}
        staffRole={staff.role}
      />
    </div>
  )
}
