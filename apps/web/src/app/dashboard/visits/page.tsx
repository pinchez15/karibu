import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { PatientsToolbar } from './PatientsToolbar'

// This page is a patient FINDER: locate a patient and open their chart. It is
// no longer a visit/workflow queue — status (draft / pending review / signed /
// closed / errored) lives in Worklists now. One row per patient.
interface PatientRow {
  id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  whatsapp_number: string | null
  date_of_birth: string | null
  birth_year: number | null
  approximate_age: number | null
  dob_precision: string | null
  sex: 'M' | 'F' | null
  patient_number: number | null
  village: string | null
  parish: string | null
}

/**
 * PostgREST `.or()` values are comma/paren-delimited — strip the delimiter
 * characters (and ilike wildcards) so a raw term can't corrupt the filter.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%_\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function getPatients(clinicId: string, page: number, limit: number, search?: string) {
  const supabase = createServiceClient()
  const cols =
    'id, first_name, last_name, display_name, whatsapp_number, date_of_birth, birth_year, approximate_age, dob_precision, sex, patient_number, village, parish'

  let query = supabase
    .from('patients')
    .select(cols, { count: 'exact' })
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  const term = search ? sanitizeSearchTerm(search) : ''
  if (term) {
    const pattern = `%${term}%`
    query = query.or(
      [
        `display_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `whatsapp_number.ilike.${pattern}`,
        `national_id.ilike.${pattern}`,
      ].join(','),
    )
  }

  const { data, error, count } = await query
  if (error) {
    console.error('Failed to fetch patients:', error)
    return { patients: [], total: 0 }
  }
  return { patients: (data ?? []) as unknown as PatientRow[], total: count ?? 0 }
}

// Age from the best available source — exact DOB, else birth year, else an
// approximate age. This is the fix for ages "in Supabase but not showing": the
// old derivation only read date_of_birth, so year-only / age-estimate patients
// rendered as "—".
function ageLabel(p: PatientRow): string {
  if (p.date_of_birth) {
    const parsed = Date.parse(p.date_of_birth)
    if (!Number.isNaN(parsed)) {
      const years = Math.floor((Date.now() - parsed) / (365.25 * 24 * 60 * 60 * 1000))
      if (years >= 1) return `${years}y`
      const months = Math.floor((Date.now() - parsed) / (30.44 * 24 * 60 * 60 * 1000))
      return months > 0 ? `${months}m` : '<1m'
    }
  }
  if (p.birth_year) return `${new Date().getFullYear() - p.birth_year}y`
  if (p.approximate_age != null) return `~${p.approximate_age}y`
  return '—'
}

function patientName(p: PatientRow): string {
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
  return composed || p.display_name || 'Unknown patient'
}

function locationLabel(p: PatientRow): string {
  return [p.village, p.parish].filter(Boolean).join(', ') || '—'
}

const GRID = 'md:grid-cols-[minmax(180px,1.6fr)_110px_150px_64px_56px_minmax(130px,1.1fr)]'

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const params = await searchParams
  const parsedPage = parseInt(params.page || '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1
  const search = params.search || ''

  const { patients, total } = await getPatients(staff.clinic_id, page, 25, search)
  const totalPages = Math.ceil(total / 25)

  const buildHref = (targetPage?: number): string => {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (targetPage && targetPage > 1) qs.set('page', String(targetPage))
    const query = qs.toString()
    return `/dashboard/visits${query ? `?${query}` : ''}`
  }

  return (
    <>
      <WebTopBar title="Patients" subtitle={`${total} ${total === 1 ? 'patient' : 'patients'}`} subtitleMeta={false} />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
        <PatientsToolbar />

        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'patient' : 'patients'}
          {search && <> matching &ldquo;{search}&rdquo;</>}
        </p>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className={`hidden md:grid ${GRID} gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>
            <div>Patient</div>
            <div>Patient #</div>
            <div>Phone</div>
            <div>Age</div>
            <div>Sex</div>
            <div>Location</div>
          </div>

          {patients.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/patients/${p.id}`}
              className={`grid grid-cols-1 ${GRID} gap-y-1 md:gap-4 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors`}
            >
              <div className="min-w-0 font-medium truncate">{patientName(p)}</div>
              <div className="text-sm text-muted-foreground md:text-foreground truncate">
                {p.patient_number ?? '—'}
              </div>
              <div className="text-sm text-muted-foreground md:text-foreground truncate">
                {p.whatsapp_number ?? '—'}
              </div>
              <div className="text-sm text-muted-foreground md:text-foreground">{ageLabel(p)}</div>
              <div className="text-sm text-muted-foreground md:text-foreground">{p.sex ?? '—'}</div>
              <div className="text-sm text-muted-foreground md:text-foreground truncate">{locationLabel(p)}</div>
            </Link>
          ))}

          {patients.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No patients found</div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildHref(page - 1)}
                  className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildHref(page + 1)}
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
