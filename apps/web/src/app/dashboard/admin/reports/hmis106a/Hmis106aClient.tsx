'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { Hmis106aReport } from '@karibu/shared'
import { currentUgandaFyStartYear, currentUgandaQuarter } from '@/lib/uganda-fy-quarter'
import { Hmis106aTable } from './Hmis106aTable'
import { downloadCsv, generateHmis106aCsv } from './csv-export'
import {
  generateHmis106aHivReport,
  generateHmis106aTbReport,
} from '@/app/dashboard/hiv-tb/actions'

interface Hmis106aClientProps {
  reportType: 'hiv' | 'tb'
  staffClinicId: string
  clinicName: string
}

export function Hmis106aClient({ reportType, staffClinicId, clinicName }: Hmis106aClientProps) {
  const [fyYear, setFyYear] = useState(currentUgandaFyStartYear())
  const [quarter, setQuarter] = useState(currentUgandaQuarter())
  const [report, setReport] = useState<Hmis106aReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, startGenerating] = useTransition()

  const title =
    reportType === 'hiv'
      ? 'HMIS 106a HIV Quarterly (DHIS2)'
      : 'HMIS 106a TB/Leprosy Quarterly (DHIS2)'

  function handleGenerate() {
    setError(null)
    setReport(null)
    startGenerating(async () => {
      const result =
        reportType === 'hiv'
          ? await generateHmis106aHivReport(fyYear, quarter, staffClinicId)
          : await generateHmis106aTbReport(fyYear, quarter, staffClinicId)
      if (result.error) setError(result.error)
      else if (result.data) setReport(result.data)
    })
  }

  function handleExport() {
    if (!report) return
    const slug = reportType === 'hiv' ? '106a-hiv' : '106a-tb'
    downloadCsv(
      `hmis-${slug}-fy${fyYear}-q${quarter}.csv`,
      generateHmis106aCsv(report),
    )
  }

  return (
    <div className="space-y-6">
      <div className="no-print rounded-xl border border-border bg-card p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Uganda financial year quarters (Jul–Jun). Export CSV for hand-entry into{' '}
          <span className="font-medium">hmis-repo.health.go.ug</span>.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">FY start year</label>
            <select
              className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={fyYear}
              onChange={(e) => setFyYear(Number(e.target.value))}
            >
              {[fyYear - 1, fyYear, fyYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}/{String(y + 1).slice(-2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Quarter</label>
            <select
              className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              <option value={1}>Q1 (Jul – Sep)</option>
              <option value={2}>Q2 (Oct – Dec)</option>
              <option value={3}>Q3 (Jan – Mar)</option>
              <option value={4}>Q4 (Apr – Jun)</option>
            </select>
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate report'}
          </Button>
          {report && (
            <Button variant="outline" onClick={handleExport}>
              Export CSV
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {report && (
        <div className="space-y-4">
          <div className="print:block">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {report.clinic_name} · {report.quarter_label}
            </p>
          </div>

          {report.quality.missing_sex_patients > 0 && (
            <div className="no-print rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber-ink">
              {report.quality.missing_sex_patients} patient(s) missing sex — age/sex counts may
              be incomplete until demographics are filled.
            </div>
          )}

          <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="HTS events (period)" value={report.quality.hts_events_in_period} />
            <Stat label="Active HIV enrollments" value={report.quality.hiv_enrollments_active} />
            <Stat label="Active TB cases" value={report.quality.tb_episodes_active} />
            <Stat label="Grand total (all rows)" value={report.rows.reduce((s, r) => s + r.total, 0)} />
          </div>

          <Hmis106aTable rows={report.rows} />
        </div>
      )}

      {!report && !generating && (
        <p className="text-sm text-muted-foreground text-center py-12">
          Select a quarter and generate to preview {clinicName}&apos;s submission.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
