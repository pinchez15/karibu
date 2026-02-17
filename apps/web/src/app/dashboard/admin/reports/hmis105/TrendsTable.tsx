'use client'

import { useMemo } from 'react'
import type { Hmis105SingleReport, Hmis105TrendRow } from '@karibu/shared'

interface TrendsTableProps {
  reports: Hmis105SingleReport[]
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function TrendsTable({ reports }: TrendsTableProps) {
  const monthKeys = useMemo(() => {
    const keys = [...new Set(reports.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))]
    return keys.sort()
  }, [reports])

  const trendRows = useMemo(() => {
    // Aggregate totals by diagnosis across all clinics for each month
    const codeMap = new Map<
      string,
      { display_name: string; sort_order: number; monthTotals: Map<string, number>; grandTotal: number }
    >()

    for (const report of reports) {
      const monthKey = `${report.year}-${String(report.month).padStart(2, '0')}`
      for (const row of report.rows) {
        if (row.total === 0) continue
        let entry = codeMap.get(row.hmis_code)
        if (!entry) {
          entry = {
            display_name: row.display_name,
            sort_order: row.sort_order,
            monthTotals: new Map(),
            grandTotal: 0,
          }
          codeMap.set(row.hmis_code, entry)
        }
        const existing = entry.monthTotals.get(monthKey) || 0
        entry.monthTotals.set(monthKey, existing + row.total)
        entry.grandTotal += row.total
      }
    }

    // Sort by grand total descending, take top 15
    const sorted = [...codeMap.entries()]
      .sort((a, b) => b[1].grandTotal - a[1].grandTotal)
      .slice(0, 15)

    return sorted.map(([hmis_code, entry]): Hmis105TrendRow => {
      const points = monthKeys.map((key) => {
        const [y, m] = key.split('-').map(Number)
        return { year: y, month: m, total: entry.monthTotals.get(key) || 0 }
      })
      const max_total = Math.max(...points.map((p) => p.total), 1)
      return { hmis_code, display_name: entry.display_name, points, max_total }
    })
  }, [reports, monthKeys])

  // Global max for bar scaling
  const globalMax = useMemo(
    () => Math.max(...trendRows.map((r) => r.max_total), 1),
    [trendRows],
  )

  if (trendRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No trend data available.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="text-left p-2 border border-border font-medium sticky left-0 bg-muted z-10 min-w-[200px]">
              Diagnosis (Top 15)
            </th>
            {monthKeys.map((key) => {
              const [y, m] = key.split('-').map(Number)
              return (
                <th key={key} className="text-center p-2 border border-border font-medium whitespace-nowrap min-w-[100px]">
                  {MONTH_ABBR[m - 1]} {y}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {trendRows.map((row) => (
            <tr key={row.hmis_code} className="hover:bg-muted/50">
              <td className="p-2 border border-border sticky left-0 bg-background z-10">
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {row.hmis_code.replace('HMIS_105_', '')}
                </span>
                {row.display_name}
              </td>
              {row.points.map((point) => {
                const pct = globalMax > 0 ? (point.total / globalMax) * 100 : 0
                return (
                  <td
                    key={`${point.year}-${point.month}`}
                    className="p-1.5 border border-border"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-sm transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums w-6 text-right">
                        {point.total || '-'}
                      </span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
