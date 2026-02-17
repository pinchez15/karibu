'use client'

import { useMemo } from 'react'
import type { Hmis105SingleReport, Hmis105SummaryRow, ClinicOption } from '@karibu/shared'

interface SummaryTableProps {
  reports: Hmis105SingleReport[]
  clinics: ClinicOption[]
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function SummaryTable({ reports, clinics }: SummaryTableProps) {
  const isMultiMonth = useMemo(() => {
    const months = new Set(reports.map((r) => `${r.year}-${r.month}`))
    return months.size > 1
  }, [reports])

  // Build column keys: either clinic names or "clinic - month" combos
  const columns = useMemo(() => {
    if (clinics.length === 1 && isMultiMonth) {
      // Single clinic, multi-month: columns are months
      const months = [...new Set(reports.map((r) => `${r.year}-${r.month}`))]
        .sort()
      return months.map((key) => {
        const [y, m] = key.split('-').map(Number)
        return {
          key,
          label: `${MONTH_ABBR[m - 1]} ${y}`,
          filter: (r: Hmis105SingleReport) => r.year === y && r.month === m,
        }
      })
    }
    if (clinics.length > 1 && !isMultiMonth) {
      // Multi-clinic, single month: columns are clinics
      return clinics.map((c) => ({
        key: c.id,
        label: c.name,
        filter: (r: Hmis105SingleReport) => r.clinic_id === c.id,
      }))
    }
    // Multi-clinic + multi-month: columns are "clinic - month"
    const cols: { key: string; label: string; filter: (r: Hmis105SingleReport) => boolean }[] = []
    for (const c of clinics) {
      const months = [...new Set(reports.filter((r) => r.clinic_id === c.id).map((r) => `${r.year}-${r.month}`))]
        .sort()
      for (const key of months) {
        const [y, m] = key.split('-').map(Number)
        cols.push({
          key: `${c.id}-${key}`,
          label: clinics.length > 1 ? `${c.name} ${MONTH_ABBR[m - 1]} ${y}` : `${MONTH_ABBR[m - 1]} ${y}`,
          filter: (r: Hmis105SingleReport) => r.clinic_id === c.id && r.year === y && r.month === m,
        })
      }
    }
    return cols
  }, [reports, clinics, isMultiMonth])

  // Build summary rows
  const summaryRows = useMemo(() => {
    // Collect all diagnosis codes across all reports
    const codeMap = new Map<string, { display_name: string; sort_order: number }>()
    for (const report of reports) {
      for (const row of report.rows) {
        if (!codeMap.has(row.hmis_code)) {
          codeMap.set(row.hmis_code, {
            display_name: row.display_name,
            sort_order: row.sort_order,
          })
        }
      }
    }

    const rows: Hmis105SummaryRow[] = []
    for (const [hmis_code, meta] of codeMap) {
      const clinic_totals: Record<string, number> = {}
      let grand_total = 0

      for (const col of columns) {
        const matchingReports = reports.filter(col.filter)
        let colTotal = 0
        for (const r of matchingReports) {
          const diagRow = r.rows.find((row) => row.hmis_code === hmis_code)
          if (diagRow) colTotal += diagRow.total
        }
        clinic_totals[col.key] = colTotal
        grand_total += colTotal
      }

      if (grand_total > 0) {
        rows.push({
          hmis_code,
          display_name: meta.display_name,
          sort_order: meta.sort_order,
          clinic_totals,
          grand_total,
        })
      }
    }

    return rows.sort((a, b) => a.sort_order - b.sort_order)
  }, [reports, columns])

  if (summaryRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No diagnoses found in the selected period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="text-left p-2 border border-border font-medium sticky left-0 bg-muted z-10">
              Diagnosis
            </th>
            {columns.map((col) => (
              <th key={col.key} className="text-center p-2 border border-border font-medium whitespace-nowrap">
                {col.label}
              </th>
            ))}
            <th className="text-center p-2 border border-border font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.map((row) => (
            <tr key={row.hmis_code} className="hover:bg-muted/50">
              <td className="p-2 border border-border sticky left-0 bg-background z-10">
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {row.hmis_code.replace('HMIS_105_', '')}
                </span>
                {row.display_name}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="text-center p-1 border border-border tabular-nums">
                  {row.clinic_totals[col.key] || '-'}
                </td>
              ))}
              <td className="text-center p-1 border border-border font-medium tabular-nums">
                {row.grand_total}
              </td>
            </tr>
          ))}
          {/* Grand total row */}
          <tr className="bg-muted font-medium">
            <td className="p-2 border border-border sticky left-0 bg-muted z-10">Grand Total</td>
            {columns.map((col) => {
              const colTotal = summaryRows.reduce((sum, r) => sum + (r.clinic_totals[col.key] || 0), 0)
              return (
                <td key={col.key} className="text-center p-1 border border-border tabular-nums">
                  {colTotal || '-'}
                </td>
              )
            })}
            <td className="text-center p-1 border border-border font-bold tabular-nums">
              {summaryRows.reduce((sum, r) => sum + r.grand_total, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
