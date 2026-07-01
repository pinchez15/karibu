'use client'

import Link from 'next/link'
import { dayOfStay, lastObsLabel } from '@/lib/inpatient-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type { CensusRow } from '@/app/dashboard/inpatient/types'
import { cn } from '@/lib/utils'

const OBS_OVERDUE_HOURS = 6

function isObsOverdue(lastObservedAt: string | null, admittedAt: string): boolean {
  const ref = lastObservedAt ?? admittedAt
  const at = new Date(ref).getTime()
  if (Number.isNaN(at)) return false
  return Date.now() - at >= OBS_OVERDUE_HOURS * 60 * 60 * 1000
}

export function WardHandoverClient({ rows }: { rows: CensusRow[] }) {
  const byWard = {
    maternity: rows.filter((r) => r.ward === 'maternity'),
    general: rows.filter((r) => r.ward === 'general'),
  }

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No one is admitted right now.</p>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-auto flex-1 space-y-8">
      {(
        [
          ['maternity', 'Maternity', byWard.maternity],
          ['general', 'General', byWard.general],
        ] as const
      ).map(([key, label, wardRows]) =>
        wardRows.length === 0 ? null : (
          <section key={key}>
            <h2 className="text-sm font-semibold text-heading mb-3">
              {label} ({wardRows.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {wardRows.map((row) => (
                <HandoverCard key={row.id} row={row} />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  )
}

function HandoverCard({ row }: { row: CensusRow }) {
  const name =
    row.patient_name?.trim() ||
    patientDisplayName({
      first_name: null,
      last_name: null,
      display_name: row.patient_name,
    })
  const overdue = isObsOverdue(row.last_observed_at, row.admitted_at)
  const obsLabel = lastObsLabel(row.last_observed_at)

  return (
    <Link
      href={`/dashboard/inpatient/${row.id}`}
      className="block rounded-xl border border-border bg-card p-4 hover:border-cobalt/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground truncate">{name}</p>
        {row.bed_label && (
          <span className="text-xs text-muted-foreground shrink-0">Bed {row.bed_label}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {[dayOfStay(row.admitted_at), row.chief_complaint].filter(Boolean).join(' · ')}
      </p>
      <p
        className={cn(
          'mt-2 text-xs font-medium',
          overdue ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {obsLabel}
        {overdue ? ' — OVERDUE' : ''}
      </p>
    </Link>
  )
}
