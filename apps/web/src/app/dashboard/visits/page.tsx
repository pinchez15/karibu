import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Visit, VisitStatus } from '@karibu/shared'
import { PatientsToolbar } from './PatientsToolbar'

interface VisitWithPatient extends Visit {
  patient: { id: string; first_name: string | null; last_name: string | null; display_name: string | null; whatsapp_number: string }
  doctor: { display_name: string } | null
}

async function getVisits(
  clinicId: string,
  statusFilter?: string,
  page: number = 1,
  limit: number = 20,
  search?: string,
) {
  const supabase = createServiceClient()

  // If searching, find matching patient IDs first
  let patientIds: string[] | null = null
  if (search) {
    const { data: matchingPatients } = await supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .or(`display_name.ilike.%${search}%,whatsapp_number.ilike.%${search}%`)

    patientIds = matchingPatients?.map(p => p.id) || []
    if (patientIds.length === 0) {
      return { visits: [], total: 0 }
    }
  }

  let query = supabase
    .from('visits')
    .select('*, patient:patients(id, first_name, last_name, display_name, whatsapp_number), doctor:staff!visits_doctor_id_fkey(display_name)', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  if (patientIds) {
    query = query.in('patient_id', patientIds)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Failed to fetch visits:', error)
    return { visits: [], total: 0 }
  }

  return { visits: (data || []) as VisitWithPatient[], total: count || 0 }
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'To Dictate', color: 'text-violet-700', bg: 'bg-violet-100' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-secondary' },
  sent: { label: 'Sent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; search?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const params = await searchParams
  const statusFilter = params.status || 'all'
  const page = parseInt(params.page || '1', 10)
  const search = params.search || ''

  const { visits, total } = await getVisits(staff.clinic_id, statusFilter, page, 20, search)
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="p-4 space-y-4">
      <PatientsToolbar />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'review', 'sent', 'completed', 'error'].map((status) => (
          <Link
            key={status}
            href={`/dashboard/visits${status !== 'all' ? `?status=${status}` : ''}${search ? `${status !== 'all' ? '&' : '?'}search=${search}` : ''}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-foreground border border-border hover:bg-secondary'
            }`}
          >
            {status === 'all' ? 'All' : statusConfig[status]?.label || status}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'visit' : 'visits'}
        {search && <> matching &ldquo;{search}&rdquo;</>}
      </p>

      {/* Visit cards */}
      <div className="space-y-2">
        {visits.map((visit) => {
          const config = statusConfig[visit.status] || statusConfig.error
          return (
            <div
              key={visit.id}
              className="bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors min-h-[72px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/patients/${visit.patient?.id}`}
                      className="font-medium truncate hover:underline"
                    >
                      {visit.patient?.display_name || 'Unknown Patient'}
                    </Link>
                    <Link
                      href={`/dashboard/visits/${visit.id}`}
                      className={`px-2 py-0.5 text-xs font-medium rounded-full hover:opacity-80 ${config.bg} ${config.color}`}
                    >
                      {config.label}
                    </Link>
                  </div>
                  <Link
                    href={`/dashboard/visits/${visit.id}`}
                    className="block text-sm text-muted-foreground mt-1"
                  >
                    {new Date(visit.visit_date).toLocaleDateString()} &middot; {visit.doctor?.display_name || 'Unassigned'}
                  </Link>
                  {visit.status === 'error' && visit.error_message && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      {visit.error_message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {visits.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            {search ? 'No patients found' : 'No visits found'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}${search ? `search=${search}&` : ''}page=${page - 1}`}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}${search ? `search=${search}&` : ''}page=${page + 1}`}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
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
