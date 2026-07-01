import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { PatientsToolbar } from './PatientsToolbar'
import {
  PATIENTS_TABLE_GRID,
  PatientsTableHeader,
  type PatientSortDir,
  type PatientSortField,
} from './PatientsTableHeader'

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
  patient_number: string | null
  village: string | null
  parish: string | null
  subcounty: string | null
  district: string | null
}

const PAGE_SIZE = 25

/**
 * PostgREST `.or()` values are comma/paren-delimited — strip the delimiter
 * characters (and ilike wildcards) so a raw term can't corrupt the filter.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%_\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseSortField(value: string | undefined): PatientSortField {
  return value === 'location' ? 'location' : 'name'
}

function parseSortDir(value: string | undefined): PatientSortDir {
  return value === 'desc' ? 'desc' : 'asc'
}

async function getPatients(
  clinicId: string,
  page: number,
  limit: number,
  search: string | undefined,
  sort: PatientSortField,
  dir: PatientSortDir,
) {
  const supabase = createServiceClient()
  const cols =
    'id, first_name, last_name, display_name, whatsapp_number, date_of_birth, birth_year, approximate_age, dob_precision, sex, patient_number, village, parish, subcounty, district'

  let query = supabase
    .from('patients')
    .select(cols, { count: 'exact' })
    .eq('clinic_id', clinicId)
    .range((page - 1) * limit, page * limit - 1)

  const term = search ? sanitizeSearchTerm(search) : ''
  if (term) {
    const pattern = `%${term}%`
    const filters = [
      `display_name.ilike.${pattern}`,
      `first_name.ilike.${pattern}`,
      `last_name.ilike.${pattern}`,
      `whatsapp_number.ilike.${pattern}`,
      `national_id.ilike.${pattern}`,
      `patient_number.ilike.${pattern}`,
      `village.ilike.${pattern}`,
      `parish.ilike.${pattern}`,
      `subcounty.ilike.${pattern}`,
      `district.ilike.${pattern}`,
    ]
    if (/^\d+$/.test(term)) {
      filters.push(`patient_number.eq.${term}`)
    }
    query = query.or(filters.join(','))
  }

  const ascending = dir === 'asc'
  if (sort === 'location') {
    query = query
      .order('village', { ascending, nullsFirst: false })
      .order('parish', { ascending, nullsFirst: false })
      .order('last_name', { ascending, nullsFirst: false })
  } else {
    query = query
      .order('last_name', { ascending, nullsFirst: false })
      .order('first_name', { ascending, nullsFirst: false })
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

function displayNameParts(p: PatientRow): { first: string; last: string } {
  if (p.first_name || p.last_name) {
    return {
      first: p.first_name?.trim() || '—',
      last: p.last_name?.trim() || '—',
    }
  }
  if (p.display_name) {
    const parts = p.display_name.trim().split(/\s+/)
    return {
      first: parts[0] ?? '—',
      last: parts.slice(1).join(' ') || '—',
    }
  }
  return { first: '—', last: '—' }
}

function addressLabel(p: PatientRow): string {
  return [p.village, p.parish, p.subcounty, p.district].filter(Boolean).join(', ') || '—'
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    search?: string
    sort?: string
    dir?: string
  }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const params = await searchParams
  const parsedPage = parseInt(params.page || '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1
  const search = params.search || ''
  const sort = parseSortField(params.sort)
  const dir = parseSortDir(params.dir)

  const { patients, total } = await getPatients(
    staff.clinic_id,
    page,
    PAGE_SIZE,
    search,
    sort,
    dir,
  )
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('district')
    .eq('id', staff.clinic_id)
    .maybeSingle()
  const defaultDistrict = clinic?.district?.trim() ?? ''

  const buildHref = (targetPage?: number): string => {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (sort !== 'name') qs.set('sort', sort)
    if (dir !== 'asc') qs.set('dir', dir)
    if (targetPage && targetPage > 1) qs.set('page', String(targetPage))
    const query = qs.toString()
    return `/dashboard/visits${query ? `?${query}` : ''}`
  }

  return (
    <>
      <WebTopBar title="Patients" subtitle={`${total} ${total === 1 ? 'patient' : 'patients'}`} subtitleMeta={false} />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
        <PatientsToolbar defaultDistrict={defaultDistrict} />

        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'patient' : 'patients'}
          {search && <> matching &ldquo;{search}&rdquo;</>}
        </p>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <PatientsTableHeader sort={sort} dir={dir} search={search} />

          {patients.map((p) => {
            const { first, last } = displayNameParts(p)
            return (
              <Link
                key={p.id}
                href={`/dashboard/patients/${p.id}`}
                className={`grid grid-cols-1 ${PATIENTS_TABLE_GRID} gap-y-1 md:gap-4 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors`}
              >
                <div className="min-w-0 font-medium truncate">{first}</div>
                <div className="min-w-0 font-medium truncate">{last}</div>
                <div className="text-sm text-muted-foreground md:text-foreground truncate">
                  {p.patient_number ?? '—'}
                </div>
                <div className="text-sm text-muted-foreground md:text-foreground truncate">
                  {p.whatsapp_number ?? '—'}
                </div>
                <div className="text-sm text-muted-foreground md:text-foreground">{ageLabel(p)}</div>
                <div className="text-sm text-muted-foreground md:text-foreground">{p.sex ?? '—'}</div>
                <div className="text-sm text-muted-foreground md:text-foreground truncate">
                  {addressLabel(p)}
                </div>
              </Link>
            )
          })}

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
