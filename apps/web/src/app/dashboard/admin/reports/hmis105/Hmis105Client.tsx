'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Hmis105Table } from './Hmis105Table'
import { generateHmis105Csv, downloadCsv } from './csv-export'
import { generateHmis105Report } from '../actions'
import type { Hmis105Report } from '@karibu/shared'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function Hmis105Client() {
  // Default to previous month
  const now = new Date()
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth() // 1-indexed
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [report, setReport] = useState<Hmis105Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, startGenerating] = useTransition()

  const handleGenerate = () => {
    setError(null)
    startGenerating(async () => {
      const result = await generateHmis105Report(year, month)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setReport(result.data)
      }
    })
  }

  const handleDownloadCsv = () => {
    if (!report) return
    const csv = generateHmis105Csv(report)
    const filename = `HMIS105_${report.clinic_name.replace(/\s+/g, '_')}_${year}_${String(month).padStart(2, '0')}.csv`
    downloadCsv(csv, filename)
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="block w-40 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="block w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Report'}
          </Button>

          {report && (
            <Button variant="outline" onClick={handleDownloadCsv}>
              Download CSV
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* Data Quality Warnings */}
      {report && (report.quality.uncoded_visits > 0 || report.quality.missing_sex > 0 || report.quality.missing_dob > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-medium text-amber-800 mb-2">Data Quality Warnings</h4>
          <div className="flex flex-wrap gap-3 text-sm">
            {report.quality.uncoded_visits > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                {report.quality.uncoded_visits} visits without HMIS codes
              </Badge>
            )}
            {report.quality.missing_sex > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                {report.quality.missing_sex} patients missing sex
              </Badge>
            )}
            {report.quality.missing_dob > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                {report.quality.missing_dob} patients missing date of birth
              </Badge>
            )}
          </div>
          <p className="text-xs text-amber-700 mt-2">
            Visits with missing demographics cannot be fully disaggregated by age/sex group.
          </p>
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                HMIS 105 - {MONTH_NAMES[report.month - 1]} {report.year}
              </h3>
              <p className="text-sm text-muted-foreground">{report.clinic_name}</p>
            </div>
            <div className="text-sm text-muted-foreground text-right">
              <p>{report.quality.total_visits} finalized visits</p>
              <p>{report.quality.coded_visits} coded ({report.quality.total_visits > 0 ? Math.round((report.quality.coded_visits / report.quality.total_visits) * 100) : 0}%)</p>
            </div>
          </div>

          <Hmis105Table rows={report.rows} />
        </div>
      )}
    </div>
  )
}
