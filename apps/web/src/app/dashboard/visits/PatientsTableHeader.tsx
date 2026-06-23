import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PatientSortField = 'name' | 'location'
export type PatientSortDir = 'asc' | 'desc'

const GRID =
  'md:grid-cols-[minmax(96px,1fr)_minmax(96px,1fr)_88px_132px_52px_44px_minmax(120px,1.1fr)]'

function buildSortHref({
  field,
  currentSort,
  currentDir,
  search,
}: {
  field: PatientSortField
  currentSort: PatientSortField
  currentDir: PatientSortDir
  search: string
}): string {
  const qs = new URLSearchParams()
  if (search) qs.set('search', search)

  const nextDir: PatientSortDir =
    currentSort === field && currentDir === 'asc' ? 'desc' : 'asc'
  qs.set('sort', field)
  qs.set('dir', nextDir)

  const query = qs.toString()
  return `/dashboard/visits${query ? `?${query}` : ''}`
}

function SortButton({
  field,
  label,
  currentSort,
  currentDir,
  search,
}: {
  field: PatientSortField
  label: string
  currentSort: PatientSortField
  currentDir: PatientSortDir
  search: string
}) {
  const active = currentSort === field
  const Icon = active ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <Link
      href={buildSortHref({ field, currentSort, currentDir, search })}
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground transition-colors',
        active && 'text-foreground',
      )}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      {active && <span className="sr-only">, sorted {currentDir === 'asc' ? 'ascending' : 'descending'}</span>}
    </Link>
  )
}

export function PatientsTableHeader({
  sort,
  dir,
  search,
}: {
  sort: PatientSortField
  dir: PatientSortDir
  search: string
}) {
  return (
    <div
      className={`hidden md:grid ${GRID} gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground`}
    >
      <SortButton
        field="name"
        label="First name"
        currentSort={sort}
        currentDir={dir}
        search={search}
      />
      <SortButton
        field="name"
        label="Last name"
        currentSort={sort}
        currentDir={dir}
        search={search}
      />
      <div>Patient #</div>
      <div>Phone</div>
      <div>Age</div>
      <div>Sex</div>
      <SortButton
        field="location"
        label="Address"
        currentSort={sort}
        currentDir={dir}
        search={search}
      />
    </div>
  )
}

export { GRID as PATIENTS_TABLE_GRID }
