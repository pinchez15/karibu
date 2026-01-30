'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { QueueItem, QueueStatus } from '@karibu/shared'

interface QueueBoardProps {
  initialQueue: QueueItem[]
  clinicId: string
  staffId: string
  staffRole: 'admin' | 'doctor' | 'nurse'
}

const statusConfig: Record<QueueStatus, { title: string; color: string; bg: string }> = {
  waiting: { title: 'Waiting', color: 'text-amber-700', bg: 'bg-amber-50' },
  with_nurse: { title: 'With Nurse', color: 'text-blue-700', bg: 'bg-blue-50' },
  ready_for_doctor: { title: 'Ready for Doctor', color: 'text-green-700', bg: 'bg-green-50' },
  with_doctor: { title: 'With Doctor', color: 'text-purple-700', bg: 'bg-purple-50' },
  completed: { title: 'Completed', color: 'text-gray-700', bg: 'bg-gray-50' },
  cancelled: { title: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50' },
}

const priorityConfig = {
  low: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-100' },
  normal: { label: 'Normal', color: 'text-blue-600', bg: 'bg-blue-100' },
  high: { label: 'High', color: 'text-amber-600', bg: 'bg-amber-100' },
  urgent: { label: 'Urgent', color: 'text-red-600', bg: 'bg-red-100' },
}

export function QueueBoard({ initialQueue, clinicId, staffId, staffRole }: QueueBoardProps) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue)
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = getSupabase()

  const isDoctor = staffRole === 'doctor' || staffRole === 'admin'
  const isNurse = staffRole === 'nurse' || staffRole === 'admin'

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visits',
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          // Refresh queue data
          fetchQueue()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId])

  const fetchQueue = async () => {
    const { data, error } = await supabase.rpc('get_clinic_queue', {
      p_clinic_id: clinicId,
    })

    if (!error && data) {
      setQueue(data as QueueItem[])
    }
  }

  const handleAssignToNurse = async (visitId: string) => {
    setLoading(visitId)
    try {
      const { error } = await supabase.rpc('assign_to_nurse', {
        p_visit_id: visitId,
        p_nurse_id: staffId,
      })
      if (error) throw error
      await fetchQueue()
    } catch (error) {
      console.error('Failed to assign:', error)
    } finally {
      setLoading(null)
    }
  }

  const handleMarkReady = async (visitId: string) => {
    setLoading(visitId)
    try {
      const { error } = await supabase.rpc('mark_ready_for_doctor', {
        p_visit_id: visitId,
      })
      if (error) throw error
      await fetchQueue()
    } catch (error) {
      console.error('Failed to mark ready:', error)
    } finally {
      setLoading(null)
    }
  }

  const handleClaimPatient = async (visitId: string) => {
    setLoading(visitId)
    try {
      const { error } = await supabase.rpc('claim_patient', {
        p_visit_id: visitId,
        p_doctor_id: staffId,
      })
      if (error) throw error
      await fetchQueue()
    } catch (error) {
      console.error('Failed to claim:', error)
    } finally {
      setLoading(null)
    }
  }

  const columns: { status: QueueStatus; filter: (item: QueueItem) => boolean }[] = [
    { status: 'waiting', filter: (item) => item.queue_status === 'waiting' },
    { status: 'with_nurse', filter: (item) => item.queue_status === 'with_nurse' },
    { status: 'ready_for_doctor', filter: (item) => item.queue_status === 'ready_for_doctor' },
    { status: 'with_doctor', filter: (item) => item.queue_status === 'with_doctor' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {columns.map(({ status, filter }) => {
        const items = queue.filter(filter)
        const config = statusConfig[status]

        return (
          <div key={status} className={`rounded-xl ${config.bg} p-4`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${config.color}`}>{config.title}</h3>
              <span className={`text-sm ${config.color} font-medium`}>{items.length}</span>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.visit_id}
                  className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.patient_name || 'Unknown Patient'}
                      </p>
                      <p className="text-sm text-gray-500">{item.patient_phone}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${priorityConfig[item.priority].bg} ${priorityConfig[item.priority].color}`}>
                      {priorityConfig[item.priority].label}
                    </span>
                  </div>

                  {item.chief_complaint && (
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {item.chief_complaint}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>#{item.queue_position}</span>
                    <span>{item.wait_minutes} min wait</span>
                  </div>

                  {/* Action buttons based on status and role */}
                  {status === 'waiting' && isNurse && (
                    <button
                      onClick={() => handleAssignToNurse(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {loading === item.visit_id ? 'Starting...' : 'Start Intake'}
                    </button>
                  )}

                  {status === 'with_nurse' && item.nurse_id === staffId && (
                    <button
                      onClick={() => handleMarkReady(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {loading === item.visit_id ? 'Updating...' : 'Ready for Doctor'}
                    </button>
                  )}

                  {status === 'ready_for_doctor' && isDoctor && (
                    <button
                      onClick={() => handleClaimPatient(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {loading === item.visit_id ? 'Claiming...' : 'Start Visit'}
                    </button>
                  )}

                  {status === 'with_doctor' && item.doctor_id === staffId && (
                    <a
                      href={`/dashboard/visits/${item.visit_id}`}
                      className="block w-full py-2 bg-gray-100 text-gray-700 text-sm font-medium text-center rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      View Visit
                    </a>
                  )}

                  {(status === 'with_nurse' && item.nurse_name) && (
                    <p className="text-xs text-gray-500 mt-2">
                      Nurse: {item.nurse_name}
                    </p>
                  )}

                  {(status === 'with_doctor' && item.doctor_name) && (
                    <p className="text-xs text-gray-500 mt-2">
                      Doctor: {item.doctor_name}
                    </p>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">
                  No patients
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
