'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ageBandFromDob,
  dayOfStay,
  lastObsLabel,
  wardLabel,
} from '@/lib/inpatient-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type { CensusRow, WardFilter } from '@/app/dashboard/inpatient/types'

export function WardCensusClient({ rows }: { rows: CensusRow[] }) {
  const [ward, setWard] = useState<WardFilter>('all')

  const filtered = useMemo(() => {
    if (ward === 'all') return rows
    return rows.filter((r) => r.ward === ward)
  }, [rows, ward])

  return (
    <div className="p-6 overflow-auto flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['general', 'General'],
              ['maternity', 'Maternity'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setWard(id)}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                ward === id
                  ? 'border-cobalt bg-cobalt-soft text-cobalt'
                  : 'border-border bg-card text-body hover:bg-background',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Link
          href="/dashboard/inpatient/admit"
          className="inline-flex items-center gap-1.5 rounded-md bg-cobalt px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-cobalt/90"
        >
          <Plus className="h-4 w-4" />
          Admit
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="max-w-lg rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-base font-medium text-foreground">No one is admitted right now.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tap Admit to add a patient to the ward.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <AdmissionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

function AdmissionCard({ row }: { row: CensusRow }) {
  const name =
    row.patient_name?.trim() ||
    patientDisplayName({
      first_name: null,
      last_name: null,
      display_name: row.patient_name,
    })

  const ageSex = [ageBandFromDob(row.date_of_birth), row.sex?.[0]?.toUpperCase()]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      href={`/dashboard/inpatient/${row.id}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft/30"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground truncate">{name}</p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {wardLabel(row.ward)}
          {row.bed_label ? ` · ${row.bed_label}` : ''}
        </span>
      </div>
      {ageSex && <p className="mt-1 text-xs text-muted-foreground">{ageSex}</p>}
      {row.chief_complaint?.trim() && (
        <p className="mt-2 text-sm text-body line-clamp-2">{row.chief_complaint}</p>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{dayOfStay(row.admitted_at)}</span>
        <span>{lastObsLabel(row.last_observed_at)}</span>
      </div>
    </Link>
  )
}
