'use client'

import { useState, useMemo, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Hmis105Table } from './Hmis105Table'
import { ClinicMultiSelect } from './ClinicMultiSelect'
import { DateRangePicker } from './DateRangePicker'
import { DataQualitySummary } from './DataQualitySummary'
import { SummaryTable } from './SummaryTable'
import { TrendsTable } from './TrendsTable'
import {
  generateHmis105Csv,
  generateMultiHmis105Csv,
  downloadCsv,
} from './csv-export'
import { generateHmis105Report, generateMultiHmis105Report } from '../actions'
import type { ClinicOption } from '@karibu/shared'
import type {
  Hmis105ReportEx,
  Hmis105MultiReportEx,
  Hmis105ReportFailure,
} from './report-types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Hmis105ClientProps {
  clinics: ClinicOption[]
  staffClinicId: string
}

export function Hmis105Client({ clinics, staffClinicId }: Hmis105ClientProps) {
  const now = new Date()
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const showClinicSelector = clinics.length > 1

  const [selectedClinicIds, setSelectedClinicIds] = useState<string[]>([staffClinicId])
  const [startYear, setStartYear] = useState(defaultYear)
  const [startMonth, setStartMonth] = useState(defaultMonth)
  const [endYear, setEndYear] = useState(defaultYear)
  const [endMonth, setEndMonth] = useState(defaultMonth)

  // Single-clinic single-month legacy report
  const [singleReport, setSingleReport] = useState<Hmis105ReportEx | null>(null)
  // Multi report
  const [multiReport, setMultiReport] = useState<Hmis105MultiReportEx | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [generating, startGenerating] = useTransition()

  // Determine if this is a single-clinic, single-month selection
  const isSingleClinicMonth = useMemo(() => {
    return selectedClinicIds.length === 1 && startYear === endYear && startMonth === endMonth
  }, [selectedClinicIds, startYear, startMonth, endYear, endMonth])

  const isMultiMonth = useMemo(() => {
    return startYear !== endYear || startMonth !== endMonth
  }, [startYear, startMonth, endYear, endMonth])

  // Active report for display
  const activeReport = isSingleClinicMonth ? singleReport : null
  const activeMultiReport = !isSingleClinicMonth ? multiReport : null
  const quality = activeReport?.quality ?? activeMultiReport?.aggregated_quality ?? null

  const handleGenerate = () => {
    setError(null)
    setSingleReport(null)
    setMultiReport(null)

    if (selectedClinicIds.length === 0) {
      setError('Select at least one clinic')
      return
    }

    // Validate date range
    if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
      setError('Start date must be before or equal to end date')
      return
    }

    startGenerating(async () => {
      if (isSingleClinicMonth) {
        // Pass the selected clinic explicitly so the generated numbers always
        // belong to the clinic shown in the header (never the admin's own
        // clinic mislabeled as the selected one).
        const result = await generateHmis105Report(
          startYear,
          startMonth,
          selectedClinicIds[0],
        )
        if (result.error) {
          setError(result.error)
        } else if (result.data) {
          setSingleReport(result.data)
        }
      } else {
        const result = await generateMultiHmis105Report(
          selectedClinicIds,
          startYear,
          startMonth,
          endYear,
          endMonth,
        )
        if (result.error) {
          setError(result.error)
        } else if (result.data) {
          setMultiReport(result.data)
        }
      }
    })
  }

  const multiFailures: Hmis105ReportFailure[] = activeMultiReport?.failures ?? []
  const isIncomplete = multiFailures.length > 0

  const handleDownloadCsv = () => {
    if (activeReport) {
      const csv = generateHmis105Csv(activeReport)
      const filename = `HMIS105_${activeReport.clinic_name.replace(/\s+/g, '_')}_${activeReport.year}_${String(activeReport.month).padStart(2, '0')}.csv`
      downloadCsv(csv, filename)
    } else if (activeMultiReport) {
      const csv = generateMultiHmis105Csv(activeMultiReport)
      const { start_year, start_month, end_year, end_month } = activeMultiReport.date_range
      // An incomplete file is named as such so it can't be mistaken for a
      // submittable report after download.
      const suffix = isIncomplete ? '_INCOMPLETE' : ''
      const filename = `HMIS105_Multi_${start_year}${String(start_month).padStart(2, '0')}_to_${end_year}${String(end_month).padStart(2, '0')}${suffix}.csv`
      downloadCsv(csv, filename)
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className={`grid gap-4 ${showClinicSelector ? 'md:grid-cols-2' : ''}`}>
          {showClinicSelector && (
            <ClinicMultiSelect
              clinics={clinics}
              selected={selectedClinicIds}
              onChange={setSelectedClinicIds}
            />
          )}

          <DateRangePicker
            startYear={startYear}
            startMonth={startMonth}
            endYear={endYear}
            endMonth={endMonth}
            onStartChange={(y, m) => { setStartYear(y); setStartMonth(m) }}
            onEndChange={(y, m) => { setEndYear(y); setEndMonth(m) }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Report'}
          </Button>

          {(activeReport || activeMultiReport) && (
            <Button variant="outline" onClick={handleDownloadCsv}>
              {isIncomplete ? 'Download CSV (INCOMPLETE)' : 'Download CSV'}
            </Button>
          )}

          {generating && (
            <span className="text-sm text-muted-foreground">
              Fetching data for {selectedClinicIds.length} clinic{selectedClinicIds.length !== 1 ? 's' : ''}...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* Failed clinic-months: the report is incomplete and must not be submitted */}
      {isIncomplete && (
        <div className="p-4 bg-red-50 text-red-900 border-2 border-red-400 rounded-lg space-y-2">
          <p className="font-bold">
            Report incomplete — do not submit. {multiFailures.length} clinic-month
            {multiFailures.length !== 1 ? 's' : ''} failed to generate and{' '}
            {multiFailures.length !== 1 ? 'are' : 'is'} missing from all tables and the CSV:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            {multiFailures.map((f) => (
              <li key={`${f.clinic_id}-${f.year}-${f.month}`}>
                <span className="font-medium">
                  {f.clinic_name} — {MONTH_NAMES[f.month - 1]} {f.year}
                </span>
                : {f.error}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Regenerate the report until no failures remain before submitting to the MoH.
          </p>
        </div>
      )}

      {/* Unfinalized visits never reach HMIS counts — surface them loudly */}
      {quality && quality.unfinalized_visits > 0 && (
        <div className="p-4 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg">
          <span className="font-semibold">
            {quality.unfinalized_visits.toLocaleString()} visit
            {quality.unfinalized_visits !== 1 ? 's' : ''} this period{' '}
            {quality.unfinalized_visits !== 1 ? 'are' : 'is'} unfinalized and not counted
          </span>{' '}
          in this report. Only visits with status sent/completed are reported; ask
          clinicians to finalize pending, in-review, and errored visits before submitting.
        </div>
      )}

      {/* Data Quality Summary */}
      {quality && <DataQualitySummary quality={quality} />}

      {/* Single clinic + single month: classic disaggregation table */}
      {activeReport && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                HMIS 105 - {MONTH_NAMES[activeReport.month - 1]} {activeReport.year}
              </h3>
              <p className="text-sm text-muted-foreground">{activeReport.clinic_name}</p>
            </div>
            <div className="text-sm text-muted-foreground text-right">
              <p>{activeReport.quality.total_visits} finalized visits</p>
              <p>
                {activeReport.quality.coded_visits} coded (
                {activeReport.quality.total_visits > 0
                  ? Math.round(
                      (activeReport.quality.coded_visits / activeReport.quality.total_visits) * 100,
                    )
                  : 0}
                %)
              </p>
            </div>
          </div>
          <Hmis105Table rows={activeReport.rows} />
        </div>
      )}

      {/* Multi-clinic or multi-month: tabbed views */}
      {activeMultiReport && (
        <MultiReportView report={activeMultiReport} isMultiMonth={isMultiMonth} />
      )}
    </div>
  )
}

function MultiReportView({
  report,
  isMultiMonth,
}: {
  report: Hmis105MultiReportEx
  isMultiMonth: boolean
}) {
  const isSingleClinic = report.clinics.length === 1

  // Determine which tabs to show
  const showTrends = isMultiMonth
  const showMonthlyDetail = isSingleClinic && isMultiMonth

  const defaultTab = 'summary'

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          HMIS 105 -{' '}
          {report.clinics.length === 1
            ? report.clinics[0].name
            : `${report.clinics.length} Clinics`}
        </h3>
        <p className="text-sm text-muted-foreground">
          {MONTH_NAMES[report.date_range.start_month - 1]} {report.date_range.start_year}
          {(report.date_range.start_year !== report.date_range.end_year ||
            report.date_range.start_month !== report.date_range.end_month) &&
            ` to ${MONTH_NAMES[report.date_range.end_month - 1]} ${report.date_range.end_year}`}
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          {showTrends && <TabsTrigger value="trends">Trends</TabsTrigger>}
          {showMonthlyDetail && <TabsTrigger value="monthly">Monthly Detail</TabsTrigger>}
        </TabsList>

        <TabsContent value="summary">
          <SummaryTable reports={report.reports} clinics={report.clinics} />
        </TabsContent>

        {showTrends && (
          <TabsContent value="trends">
            <TrendsTable reports={report.reports} />
          </TabsContent>
        )}

        {showMonthlyDetail && (
          <TabsContent value="monthly">
            <MonthlyDetailView reports={report.reports} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function MonthlyDetailView({
  reports,
}: {
  reports: Hmis105MultiReportEx['reports']
}) {
  const sorted = useMemo(
    () =>
      [...reports].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year
        return a.month - b.month
      }),
    [reports],
  )

  return (
    <div className="space-y-8">
      {sorted.map((r) => (
        <div key={`${r.clinic_id}-${r.year}-${r.month}`} className="space-y-2">
          <h4 className="font-semibold">
            {MONTH_NAMES[r.month - 1]} {r.year}
          </h4>
          <p className="text-sm text-muted-foreground">
            {r.quality.total_visits} visits, {r.quality.coded_visits} coded
          </p>
          <Hmis105Table rows={r.rows} />
        </div>
      ))}
    </div>
  )
}
