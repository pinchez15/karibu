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

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  recording: { label: 'Recording', color: 'text-amber-700', bg: 'bg-amber-100' },
  uploading: { label: 'Uploading', color: 'text-sky-700', bg: 'bg-sky-100' },
  processing: { label: 'Processing', color: 'text-violet-700', bg: 'bg-violet-100' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-secondary' },
  sent: { label: 'Sent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const params = await searchParams
  const statusFilter = params.status || 'all'
  const page = parseInt(params.page || '1', 10)

  const { visits, total } = await getVisits(staff.clinic_id, statusFilter, page)
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="p-4 space-y-4">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {['all', 'review', 'processing', 'sent', 'completed', 'error'].map((status) => (
          <Link
            key={status}
            href={`/dashboard/visits${status !== 'all' ? `?status=${status}` : ''}`}
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

      <p className="text-sm text-muted-foreground">{total} visits</p>

      {/* Visit cards */}
      <div className="space-y-2">
        {visits.map((visit) => {
          const config = statusConfig[visit.status] || statusConfig.error
          return (
            <Link
              key={visit.id}
              href={`/dashboard/visits/${visit.id}`}
              className="block bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors min-h-[72px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {visit.patient?.display_name || 'Unknown Patient'}
                    </p>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(visit.visit_date).toLocaleDateString()} &middot; {visit.doctor?.display_name || 'Unassigned'}
                  </p>
                  {visit.status === 'error' && visit.error_message && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      {visit.error_message}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          )
        })}

        {visits.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            No visits found
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
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}page=${page - 1}`}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/dashboard/visits?${statusFilter !== 'all' ? `status=${statusFilter}&` : ''}page=${page + 1}`}
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
