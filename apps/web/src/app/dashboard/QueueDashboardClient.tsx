'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import {
  Users,
  UserCheck,
  Stethoscope,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { QueueItem, QueueStatus } from '@karibu/shared'

interface QueueDashboardClientProps {
  initialQueue: QueueItem[]
  reviewCount: number
  clinicId: string
  staffId: string
  staffRole: 'admin' | 'doctor' | 'nurse'
  staffName: string
}

const priorityConfig = {
  low: { label: 'Low', color: 'text-muted-foreground', bg: 'bg-muted' },
  normal: { label: 'Normal', color: 'text-primary', bg: 'bg-secondary' },
  high: { label: 'High', color: 'text-amber-700', bg: 'bg-amber-100' },
  urgent: { label: 'Urgent', color: 'text-red-700', bg: 'bg-red-100' },
}

function getWaitTime(minutes: number): string {
  if (minutes < 1) return 'Just now'
  if (minutes === 1) return '1 min'
  if (minutes < 60) return `${minutes} mins`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export function QueueDashboardClient({
  initialQueue,
  reviewCount,
  clinicId,
  staffId,
  staffRole,
}: QueueDashboardClientProps) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue)
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = getSupabase()

  const isDoctor = staffRole === 'doctor' || staffRole === 'admin'
  const isNurse = staffRole === 'nurse' || staffRole === 'admin'

  // Filter queue by status
  const waitingNurse = queue.filter(q => q.queue_status === 'waiting')
  const withNurse = queue.filter(q => q.queue_status === 'with_nurse')
  const readyForDoctor = queue.filter(q => q.queue_status === 'ready_for_doctor')
  const withDoctor = queue.filter(q => q.queue_status === 'with_doctor')
  const completed = queue.filter(q => q.queue_status === 'completed')

  const totalWaiting = waitingNurse.length + withNurse.length + readyForDoctor.length

  // Real-time updates
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
        () => fetchQueue()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clinicId])

  const fetchQueue = async () => {
    const { data, error } = await supabase.rpc('get_clinic_queue', {
      p_clinic_id: clinicId,
    })
    if (!error && data) setQueue(data as QueueItem[])
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

  const QueueCard = ({ item, showActions = true }: { item: QueueItem; showActions?: boolean }) => {
    const isUrgent = item.priority === 'urgent'
    const isHigh = item.priority === 'high'

    return (
      <div className={`bg-card border rounded-lg p-4 space-y-3 ${
        isUrgent ? 'border-red-300 bg-red-50/50' :
        isHigh ? 'border-amber-300 bg-amber-50/30' :
        'border-border'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium">{item.patient_name || 'Unknown Patient'}</p>
              {(isUrgent || isHigh) && (
                <Badge variant="destructive" className="text-xs">
                  {isUrgent ? 'Urgent' : 'High'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.chief_complaint || 'No complaint recorded'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>#{item.queue_position}</span>
          <span>{getWaitTime(item.wait_minutes)} wait</span>
          {item.nurse_name && <span>Nurse: {item.nurse_name}</span>}
          {item.doctor_name && <span>Dr. {item.doctor_name}</span>}
        </div>

        {showActions && (
          <div className="flex gap-2">
            {item.queue_status === 'waiting' && isNurse && (
              <Button
                size="sm"
                onClick={() => handleAssignToNurse(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10"
              >
                {loading === item.visit_id ? 'Starting...' : 'Call Patient'}
              </Button>
            )}

            {item.queue_status === 'with_nurse' && item.nurse_id === staffId && (
              <Button
                size="sm"
                onClick={() => handleMarkReady(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700"
              >
                {loading === item.visit_id ? 'Updating...' : 'Send to Doctor'}
              </Button>
            )}

            {item.queue_status === 'ready_for_doctor' && isDoctor && (
              <Button
                size="sm"
                onClick={() => handleClaimPatient(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10"
              >
                {loading === item.visit_id ? 'Claiming...' : 'Start Encounter'}
              </Button>
            )}

            {item.queue_status === 'with_doctor' && item.doctor_id === staffId && (
              <Link href={`/dashboard/visits/${item.visit_id}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full h-10">
                  View Patient
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    )
  }

  // Combine nurse queue and with_nurse for the Nurse tab
  const nurseTabItems = [...waitingNurse, ...withNurse].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
    return (a.wait_minutes || 0) - (b.wait_minutes || 0)
  })

  // Doctor tab: ready_for_doctor + with_doctor
  const doctorTabItems = [...readyForDoctor, ...withDoctor].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
    return (a.wait_minutes || 0) - (b.wait_minutes || 0)
  })

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Queue stats strip */}
      <div className="bg-muted/30 border-b border-border px-4 py-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-lg p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-amber-600">{waitingNurse.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Waiting</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-primary">{readyForDoctor.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Ready for Doctor</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-emerald-600">{completed.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Done Today</p>
          </div>
        </div>

        {/* Review queue banner */}
        {reviewCount > 0 && (
          <Link
            href="/dashboard/review"
            className="mt-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {reviewCount} visit{reviewCount > 1 ? 's' : ''} to review
              </span>
            </div>
            <span className="text-sm text-amber-600">Review &rarr;</span>
          </Link>
        )}
      </div>

      {/* Queue tabs */}
      <Tabs defaultValue="nurse" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border h-12 bg-background">
          <TabsTrigger value="nurse" className="flex-1 gap-2">
            <UserCheck className="w-4 h-4" />
            Nurse ({nurseTabItems.length})
          </TabsTrigger>
          <TabsTrigger value="doctor" className="flex-1 gap-2">
            <Stethoscope className="w-4 h-4" />
            Doctor ({doctorTabItems.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="flex-1 gap-2">
            <Users className="w-4 h-4" />
            Active ({withDoctor.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1 gap-2">
            <CheckCircle className="w-4 h-4" />
            Done ({completed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nurse" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {nurseTabItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No patients waiting for nurse</p>
            </div>
          ) : (
            nurseTabItems.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="doctor" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {doctorTabItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No patients waiting for doctor</p>
            </div>
          ) : (
            doctorTabItems.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="active" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {withDoctor.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active consultations</p>
            </div>
          ) : (
            withDoctor.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="done" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {completed.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No completed encounters yet</p>
            </div>
          ) : (
            completed.map(item => <QueueCard key={item.visit_id} item={item} showActions={false} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
