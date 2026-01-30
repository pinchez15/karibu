import { getStaff, getClinicId } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import Link from 'next/link'
import { redirect } from 'next/navigation'

async function getDashboardStats(clinicId: string) {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Get today's queue stats
  const { data: queueData } = await supabase
    .from('visits')
    .select('queue_status')
    .eq('clinic_id', clinicId)
    .eq('visit_date', today)

  const queueStats = {
    waiting: 0,
    withNurse: 0,
    readyForDoctor: 0,
    withDoctor: 0,
    completed: 0,
  }

  for (const visit of queueData || []) {
    switch (visit.queue_status) {
      case 'waiting': queueStats.waiting++; break
      case 'with_nurse': queueStats.withNurse++; break
      case 'ready_for_doctor': queueStats.readyForDoctor++; break
      case 'with_doctor': queueStats.withDoctor++; break
      case 'completed': queueStats.completed++; break
    }
  }

  // Get recent visits (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: recentVisits, count: totalVisits } = await supabase
    .from('visits')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .gte('created_at', weekAgo.toISOString())

  // Get visits needing review
  const { data: reviewVisits, count: reviewCount } = await supabase
    .from('visits')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .eq('status', 'review')

  // Get error visits
  const { count: errorCount } = await supabase
    .from('visits')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .eq('status', 'error')

  return {
    queue: queueStats,
    totalToday: (queueData || []).length,
    totalWeek: totalVisits || 0,
    needsReview: reviewCount || 0,
    errors: errorCount || 0,
  }
}

export default async function DashboardPage() {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const clinicId = staff.clinic_id
  const stats = await getDashboardStats(clinicId)

  return (
    <div>
      {/* Welcome section */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">
          Welcome back, {staff.display_name}
        </h2>
        <p className="text-slate-500 mt-1">
          Here's what's happening at your clinic today
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="data-label">In Queue</p>
          <p className="text-3xl font-bold text-slate-800 mt-2 font-mono">
            {stats.queue.waiting + stats.queue.withNurse + stats.queue.readyForDoctor + stats.queue.withDoctor}
          </p>
          <p className="text-sm text-slate-500 mt-1">patients today</p>
        </div>

        <div className="card">
          <p className="data-label">Ready for Doctor</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2 font-mono">
            {stats.queue.readyForDoctor}
          </p>
          <p className="text-sm text-slate-500 mt-1">awaiting</p>
        </div>

        <div className="card">
          <p className="data-label">Needs Review</p>
          <p className="text-3xl font-bold text-primary mt-2 font-mono">
            {stats.needsReview}
          </p>
          <p className="text-sm text-slate-500 mt-1">visits</p>
        </div>

        <div className="card">
          <p className="data-label">Completed Today</p>
          <p className="text-3xl font-bold text-slate-800 mt-2 font-mono">
            {stats.queue.completed}
          </p>
          <p className="text-sm text-slate-500 mt-1">visits</p>
        </div>
      </div>

      {/* Errors alert */}
      {stats.errors > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-red-800">
                {stats.errors} visit{stats.errors > 1 ? 's' : ''} have errors
              </p>
              <p className="text-sm text-red-600">
                Check the visits page to review and retry failed processing
              </p>
            </div>
            <Link
              href="/dashboard/visits?status=error"
              className="btn-danger text-sm"
            >
              View
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Queue Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Waiting</span>
              <span className="font-medium text-amber-600 font-mono">{stats.queue.waiting}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">With Nurse</span>
              <span className="font-medium text-sky-600 font-mono">{stats.queue.withNurse}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Ready for Doctor</span>
              <span className="font-medium text-emerald-600 font-mono">{stats.queue.readyForDoctor}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">With Doctor</span>
              <span className="font-medium text-violet-600 font-mono">{stats.queue.withDoctor}</span>
            </div>
          </div>
          <Link
            href="/dashboard/queue"
            className="btn-primary w-full mt-6"
          >
            View Queue
          </Link>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">This Week</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Visits</span>
              <span className="font-medium font-mono">{stats.totalWeek}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Today</span>
              <span className="font-medium font-mono">{stats.totalToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Avg per Day</span>
              <span className="font-medium font-mono">{Math.round(stats.totalWeek / 7)}</span>
            </div>
          </div>
          <Link
            href="/dashboard/visits"
            className="btn-secondary w-full mt-6"
          >
            View All Visits
          </Link>
        </div>
      </div>
    </div>
  )
}
