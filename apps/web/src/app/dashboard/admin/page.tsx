import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function getClinicStats(clinicId: string) {
  const supabase = createServiceClient()

  // Get staff count
  const { count: staffCount } = await supabase
    .from('staff')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .eq('is_active', true)

  // Get patient count
  const { count: patientCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)

  // Get visits by day for last 7 days
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: recentVisits } = await supabase
    .from('visits')
    .select('visit_date')
    .eq('clinic_id', clinicId)
    .gte('visit_date', weekAgo.toISOString().split('T')[0])

  // Count visits per day
  const visitsByDay: Record<string, number> = {}
  for (const visit of recentVisits || []) {
    const date = visit.visit_date
    visitsByDay[date] = (visitsByDay[date] || 0) + 1
  }

  // Get clinic info
  const { data: clinic } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single()

  return {
    staffCount: staffCount || 0,
    patientCount: patientCount || 0,
    visitsByDay,
    totalWeekVisits: recentVisits?.length || 0,
    clinic,
  }
}

export default async function AdminPage() {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const admin = await isAdmin()
  if (!admin) {
    redirect('/dashboard')
  }

  const stats = await getClinicStats(staff.clinic_id)

  // Generate last 7 days for chart
  const days: { date: string; label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      count: stats.visitsByDay[dateStr] || 0,
    })
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1)

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
        <p className="text-gray-600 mt-1">
          Manage your clinic settings and staff
        </p>
      </div>

      {/* Clinic Info */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Name</p>
            <p className="font-medium">{stats.clinic?.name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Slug</p>
            <p className="font-medium">{stats.clinic?.slug || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">WhatsApp Number</p>
            <p className="font-medium">{stats.clinic?.whatsapp_phone_number || 'Not configured'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Timezone</p>
            <p className="font-medium">{stats.clinic?.timezone || '-'}</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Active Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.staffCount}</p>
          <Link
            href="/dashboard/admin/staff"
            className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
          >
            Manage staff →
          </Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Total Patients</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.patientCount}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Visits This Week</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalWeekVisits}</p>
          <p className="text-sm text-gray-500 mt-1">
            Avg: {Math.round(stats.totalWeekVisits / 7)} per day
          </p>
        </div>
      </div>

      {/* Visits Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Visits Per Day (Last 7 Days)</h3>
        <div className="flex items-end justify-between gap-2 h-40">
          {days.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center">
              <div className="w-full flex items-end justify-center" style={{ height: 120 }}>
                <div
                  className="w-full max-w-[40px] bg-blue-500 rounded-t"
                  style={{ height: `${(day.count / maxCount) * 100}%`, minHeight: day.count > 0 ? 4 : 0 }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{day.label}</p>
              <p className="text-sm font-medium text-gray-900">{day.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/admin/staff"
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM12.75 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">Staff Management</h4>
              <p className="text-sm text-gray-500">View, invite, and manage staff members</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/admin/reports"
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-emerald-200 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">HMIS Reports</h4>
              <p className="text-sm text-gray-500">Generate HMIS 105 reports and review data quality</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
