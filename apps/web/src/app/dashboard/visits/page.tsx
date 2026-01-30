import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Visit, VisitStatus } from '@karibu/shared'

interface VisitWithPatient extends Visit {
  patient: { display_name: string | null; whatsapp_number: string }
  doctor: { display_name: string } | null
}

async function getVisits(
  clinicId: string,
  statusFilter?: string,
  page: number = 1,
  limit: number = 20
) {
  const supabase = createServiceClient()

  let query = supabase
    .from('visits')
    .select('*, patient:patients(display_name, whatsapp_number), doctor:staff!visits_doctor_id_fkey(display_name)', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Failed to fetch visits:', error)
    return { visits: [], total: 0 }
  }

  return { visits: (data || []) as VisitWithPatient[], total: count || 0 }
}

const statusConfig: Record<VisitStatus | 'error', { label: string; color: string; bg: string }> = {
  recording: { label: 'Recording', color: 'text-amber-700', bg: 'bg-amber-100' },
  uploading: { label: 'Uploading', color: 'text-blue-700', bg: 'bg-blue-100' },
  processing: { label: 'Processing', color: 'text-purple-700', bg: 'bg-purple-100' },
  review: { label: 'Review', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  sent: { label: 'Sent', color: 'text-green-700', bg: 'bg-green-100' },
  completed: { label: 'Completed', color: 'text-gray-700', bg: 'bg-gray-100' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const params = await searchParams
  const statusFilter = params.status || 'all'
  const page = parseInt(params.page || '1', 10)

  const { visits, total } = await getVisits(staff.clinic_id, statusFilter, page)
  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Visits</h2>
          <p className="text-gray-600 mt-1">{total} total visits</p>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'review', 'processing', 'sent', 'completed', 'error'].map((status) => (
          <Link
            key={status}
            href={`/dashboard/visits${status !== 'all' ? `?status=${status}` : ''}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : statusConfig[status as VisitStatus].label}
          </Link>
        ))}
      </div>

      {/* Visits table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Patient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Doctor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visits.map((visit) => {
              const config = statusConfig[visit.status]
              return (
                <tr key={visit.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {visit.patient?.display_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-500">{visit.patient?.whatsapp_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(visit.visit_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {visit.doctor?.display_name || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    {visit.status === 'error' && visit.error_message && (
                      <p className="text-xs text-red-600 mt-1 max-w-xs truncate">
                        {visit.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/visits/${visit.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              )
            })}
            {visits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No visits found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}page=${page - 1}`}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}page=${page + 1}`}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
