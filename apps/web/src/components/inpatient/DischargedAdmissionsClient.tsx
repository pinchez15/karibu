'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ageBandFromDob, wardLabel } from '@/lib/inpatient-format'
import { patientDisplayName } from '@/lib/referral-summary'
import { loadDischargedAdmissions } from '@/app/dashboard/inpatient/actions'
import type { DischargedRow, DischargeOutcomeFilter } from '@/app/dashboard/inpatient/types'

const OUTCOME_OPTIONS: Array<[DischargeOutcomeFilter, string]> = [
  ['all', 'All outcomes'],
  ['recovered', 'Recovered'],
  ['improved', 'Improved'],
  ['unchanged', 'Unchanged'],
  ['referred', 'Referred'],
  ['absconded', 'Absconded'],
  ['died', 'Died'],
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function outcomeBadgeClass(outcome: string): string {
  if (outcome === 'died') return 'border-destructive/40 bg-red-50 text-destructive'
  if (outcome === 'absconded' || outcome === 'referred') return 'border-amber/40 bg-amber-50 text-amber'
  return 'border-green/40 bg-green-soft text-green'
}

/** B1 — Discharged tab: date-range + outcome filters over rpc_discharged_admissions. */
export function DischargedAdmissionsClient({
  clinicId,
  initialRows,
  initialFrom,
  initialTo,
}: {
  clinicId: string
  initialRows: DischargedRow[]
  initialFrom: string
  initialTo: string
}) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [outcome, setOutcome] = useState<DischargeOutcomeFilter>('all')
  const [rows, setRows] = useState(initialRows)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function refetch(nextFrom: string, nextTo: string, nextOutcome: DischargeOutcomeFilter) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await loadDischargedAdmissions(clinicId, nextFrom, nextTo, nextOutcome)
        setRows(result)
      } catch {
        setError('Could not load discharged patients. Try again.')
      }
    })
  }

  function applyPreset(days: number) {
    const nextFrom = isoDaysAgo(days)
    const nextTo = todayIso()
    setFrom(nextFrom)
    setTo(nextTo)
    refetch(nextFrom, nextTo, outcome)
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => applyPreset(7)} className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors">
            Last 7 days
          </button>
          <button type="button" onClick={() => applyPreset(30)} className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors">
            Last 30 days
          </button>
          <button type="button" onClick={() => applyPreset(90)} className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors">
            Last 90 days
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Outcome
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as DischargeOutcomeFilter)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {OUTCOME_OPTIONS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => refetch(from, to, outcome)}
            className="mt-4 rounded-md bg-cobalt px-3 py-1.5 text-sm font-semibold text-white hover:bg-cobalt/90 disabled:opacity-60"
          >
            {pending ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows.length === 0 ? (
        <div className="max-w-lg rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-base font-medium text-foreground">No discharges in this range.</p>
          <p className="mt-2 text-sm text-muted-foreground">Widen the date range or clear the outcome filter.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/dashboard/inpatient/${row.id}`} className="min-w-0 flex-1 hover:opacity-80">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">
                      {row.patient_name?.trim() || patientDisplayName({ display_name: row.patient_name })}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize',
                        outcomeBadgeClass(row.outcome),
                      )}
                    >
                      {row.outcome}
                    </span>
                    {row.status === 'transferred' && (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Transferred
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[wardLabel(row.ward), ageBandFromDob(row.date_of_birth), row.sex?.[0]?.toUpperCase()]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Admitted {fmtDate(row.admitted_at)} → Discharged {fmtDate(row.discharged_at)}
                  </p>
                </Link>
                <Link
                  href={`/dashboard/inpatient/${row.id}/print`}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-body hover:bg-card"
                  title="Print discharge summary"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
