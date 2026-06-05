import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Visit, VisitStatus } from '@karibu/shared'
import { WebTopBar } from '@/components/web-shell'
import { PatientsToolbar } from './PatientsToolbar'
import {
  VISIT_STATUS_DISPLAY,
  VISIT_STATUS_FILTER_ORDER,
  getStatusDisplay,
} from '@/lib/visit-status'

interface VisitWithPatient extends Visit {
  patient: {
    id: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    whatsapp_number: string | null
    date_of_birth: string | null
    sex: 'M' | 'F' | null
    patient_number: string | null
  }
  doctor: { display_name: string } | null
}

async function getVisits(
  clinicId: string,
  statusFilter?: string,
  page: number = 1,
  limit: number = 25,
  search?: string,
) {
  const supabase = createServiceClient()

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
    .select(
      '*, patient:patients(id, first_name, last_name, display_name, whatsapp_number, date_of_birth, sex, patient_number), doctor:staff!visits_doctor_id_fkey(display_name)',
      { count: 'exact' },
    )
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

function deriveAgeLabel(dob: string | null): string | null {
  if (!dob) return null
  const parsed = Date.parse(dob)
  if (Number.isNaN(parsed)) return null
  const years = Math.floor((Date.now() - parsed) / (365.25 * 24 * 60 * 60 * 1000))
  if (years < 0) return null
  if (years >= 1) return `${years}y`
  const months = Math.floor((Date.now() - parsed) / (30.44 * 24 * 60 * 60 * 1000))
  return months > 0 ? `${months}m` : '<1m'
}

function patientName(p: VisitWithPatient['patient']): string {
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
  return composed || p.display_name || 'Unknown patient'
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

  const { visits, total } = await getVisits(staff.clinic_id, statusFilter, page, 25, search)
  const totalPages = Math.ceil(total / 25)

  const filters: Array<'all' | VisitStatus> = ['all', ...VISIT_STATUS_FILTER_ORDER]

  const buildHref = (status: string, targetPage?: number): string => {
    const qs = new URLSearchParams()
    if (status !== 'all') qs.set('status', status)
    if (search) qs.set('search', search)
    if (targetPage && targetPage > 1) qs.set('page', String(targetPage))
    const query = qs.toString()
    return `/dashboard/visits${query ? `?${query}` : ''}`
  }

  return (
    <>
      <WebTopBar title="Patients" subtitle={`${total} visits`} subtitleMeta={false} />
      <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
      <PatientsToolbar />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {filters.map((status) => {
          const active = statusFilter === status
          const label =
            status === 'all'
              ? 'All'
              : VISIT_STATUS_DISPLAY[status]?.label ?? status
          return (
            <Link
              key={status}
              href={buildHref(status)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground border border-border hover:bg-secondary'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'visit' : 'visits'}
        {search && <> matching &ldquo;{search}&rdquo;</>}
      </p>

      {/* Patients / visits table — landscape-first. Drops back to a stacked
          card on narrow viewports so the row stays scannable on tablets. */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[minmax(220px,2fr)_120px_120px_minmax(180px,1.4fr)_120px_140px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Patient</div>
          <div>Patient #</div>
          <div>Age / Sex</div>
          <div>Doctor</div>
          <div>Visit date</div>
          <div>Status</div>
        </div>

        {visits.map((visit) => {
          const display = getStatusDisplay(visit.status)
          const name = patientName(visit.patient)
          const age = deriveAgeLabel(visit.patient.date_of_birth)
          const ageSex = [age, visit.patient.sex].filter(Boolean).join(' · ') || '—'
          const dateLabel = new Date(visit.visit_date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })

          return (
            <div
              key={visit.id}
              className="grid grid-cols-1 md:grid-cols-[minmax(220px,2fr)_120px_120px_minmax(180px,1.4fr)_120px_140px] gap-y-1 md:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/patients/${visit.patient.id}`}
                  className="font-medium hover:underline truncate block"
                >
                  {name}
                </Link>
                {visit.patient.whatsapp_number && (
                  <div className="text-xs text-muted-foreground truncate">
                    {visit.patient.whatsapp_number}
                  </div>
                )}
                {visit.status === 'error' && visit.error_message && (
                  <p className="text-xs text-destructive mt-1 truncate">
                    {visit.error_message}
                  </p>
                )}
              </div>
              <div className="text-sm text-muted-foreground md:text-foreground truncate">
                {visit.patient.patient_number ?? '—'}
              </div>
              <div className="text-sm text-muted-foreground md:text-foreground">{ageSex}</div>
              <div className="text-sm text-muted-foreground md:text-foreground truncate">
                {visit.doctor?.display_name ?? 'Unassigned'}
              </div>
              <div className="text-sm text-muted-foreground md:text-foreground">{dateLabel}</div>
              <div>
                <Link
                  href={`/dashboard/visits/${visit.id}`}
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full hover:opacity-80 ${display.bg} ${display.color}`}
                >
                  {display.label}
                </Link>
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
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(statusFilter, page - 1)}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(statusFilter, page + 1)}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  )
}
