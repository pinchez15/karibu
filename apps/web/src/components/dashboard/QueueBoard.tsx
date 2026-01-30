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

// Clinical status colors (from STYLING_PRD)
const statusConfig: Record<QueueStatus, { title: string; color: string; bg: string }> = {
  waiting: { title: 'Waiting', color: 'text-amber-700', bg: 'bg-amber-50' },
  with_nurse: { title: 'With Nurse', color: 'text-sky-700', bg: 'bg-sky-50' },
  ready_for_doctor: { title: 'Ready for Doctor', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  with_doctor: { title: 'With Doctor', color: 'text-violet-700', bg: 'bg-violet-50' },
  completed: { title: 'Completed', color: 'text-slate-600', bg: 'bg-slate-50' },
  cancelled: { title: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50' },
}

const priorityConfig = {
  low: { label: 'Low', color: 'text-slate-500', bg: 'bg-slate-100' },
  normal: { label: 'Normal', color: 'text-sky-700', bg: 'bg-sky-100' },
  high: { label: 'High', color: 'text-amber-700', bg: 'bg-amber-100' },
  urgent: { label: 'Urgent', color: 'text-red-700', bg: 'bg-red-100' },
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
      p_staff_id: staffId,
    })

    if (error) {
      console.error('Failed to fetch queue:', error)
    }

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
          <div key={status} className={`rounded-lg ${config.bg} p-4 border border-slate-200`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${config.color}`}>{config.title}</h3>
              <span className={`text-sm ${config.color} font-medium font-mono`}>{items.length}</span>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.visit_id}
                  className="card"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-800">
                        {item.patient_name || 'Unknown Patient'}
                      </p>
                      <p className="text-sm text-slate-500 font-mono">{item.patient_phone}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${priorityConfig[item.priority].bg} ${priorityConfig[item.priority].color}`}>
                      {priorityConfig[item.priority].label}
                    </span>
                  </div>

                  {item.chief_complaint && (
                    <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                      {item.chief_complaint}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span className="font-mono">#{item.queue_position}</span>
                    <span className="font-mono">{item.wait_minutes}m wait</span>
                  </div>

                  {/* Action buttons - 48px min height for touch targets */}
                  {status === 'waiting' && isNurse && (
                    <button
                      onClick={() => handleAssignToNurse(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="btn-primary w-full"
                    >
                      {loading === item.visit_id ? 'Starting...' : 'Start Intake'}
                    </button>
                  )}

                  {status === 'with_nurse' && item.nurse_id === staffId && (
                    <button
                      onClick={() => handleMarkReady(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="btn-success w-full"
                    >
                      {loading === item.visit_id ? 'Updating...' : 'Ready for Doctor'}
                    </button>
                  )}

                  {status === 'ready_for_doctor' && isDoctor && (
                    <button
                      onClick={() => handleClaimPatient(item.visit_id)}
                      disabled={loading === item.visit_id}
                      className="w-full min-h-touch px-4 py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      {loading === item.visit_id ? 'Claiming...' : 'Start Visit'}
                    </button>
                  )}

                  {status === 'with_doctor' && item.doctor_id === staffId && (
                    <a
                      href={`/dashboard/visits/${item.visit_id}`}
                      className="btn-secondary w-full"
                    >
                      View Visit
                    </a>
                  )}

                  {(status === 'with_nurse' && item.nurse_name) && (
                    <p className="text-xs text-slate-500 mt-2">
                      Nurse: {item.nurse_name}
                    </p>
                  )}

                  {(status === 'with_doctor' && item.doctor_name) && (
                    <p className="text-xs text-slate-500 mt-2">
                      Doctor: {item.doctor_name}
                    </p>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-8">
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
