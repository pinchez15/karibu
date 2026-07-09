'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { getInpatientMonthlySummary } from './actions'
import type { InpatientMonthlySummary } from './types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function defaultMonth(): { year: number; month: number } {
  const now = new Date()
  // Default to the previous full month — the current month is still in
  // progress, so its counts would be misleadingly incomplete.
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

export function InpatientMonthlyClient({ initialSummary }: { initialSummary: InpatientMonthlySummary | null }) {
  const start = defaultMonth()
  const [year, setYear] = useState(start.year)
  const [month, setMonth] = useState(start.month)
  const [summary, setSummary] = useState<InpatientMonthlySummary | null>(initialSummary)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  function generate(y: number, m: number) {
    setError(null)
    startTransition(async () => {
      const result = await getInpatientMonthlySummary(y, m)
      if (result.error) {
        setError(result.error)
        setSummary(null)
      } else {
        setSummary(result.data)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm w-36"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm w-24"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <Button onClick={() => generate(year, month)} disabled={pending}>
          {pending ? 'Generating...' : 'Generate'}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">{error}</div>
      )}

      {summary && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{MONTH_NAMES[month - 1]} {year}</h3>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Admissions" value={summary.admissions} />
            <Stat label="Discharges" value={summary.discharges} />
            <Stat label="Deliveries" value={summary.deliveries} />
            <Stat label="Bed-days" value={summary.bed_days} />
            <Stat
              label="Mean LOS (days)"
              value={summary.mean_length_of_stay_days != null ? summary.mean_length_of_stay_days.toFixed(1) : '—'}
            />
          </div>

          <div>
            <p className="kh-meta mb-2">Discharge outcomes</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Recovered" value={summary.recovered} accent="text-green" />
              <Stat label="Improved" value={summary.improved} accent="text-green" />
              <Stat label="Unchanged" value={summary.unchanged} />
              <Stat label="Referred out" value={summary.referred_out} accent="text-amber" />
              <Stat label="Absconded" value={summary.absconded} accent="text-amber" />
              <Stat label="Died" value={summary.died} accent="text-destructive" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
    </div>
  )
}
