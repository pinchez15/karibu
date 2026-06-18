import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'
import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { KpiCard } from './_components/kpi-card'
import { ReportTile } from './_components/report-tile'

/**
 * Analyst overview — real-data face of /dashboard/admin/reports.
 *
 * KPIs are computed from the visits + payments tables for the current
 * calendar month. Anything we can't compute from the existing schema
 * shows "—" rather than mock data.
 *
 * Wired-through reports: HMIS 105 + Data Quality (existing routes).
 * The other tiles route to /dashboard/admin/reports/coming-soon/[slug]
 * stubs and render without mini-charts / placeholder stats — only the
 * tag, title, and description (which describe the planned capability).
 */

interface AnalystMetrics {
  monthLabel: string
  visitsThisMonth: number
  uniquePatientsThisMonth: number
  revenueThisMonthUgx: number | null
  /** Average documentation duration in seconds (visit checked_in_at → documentation_completed_at). */
  avgVisitSeconds: number | null
}

async function getAnalystMetrics(clinicId: string): Promise<AnalystMetrics> {
  const supabase = createServiceClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStartIso = monthStart.toISOString()
  const monthStartDate = monthStartIso.slice(0, 10)
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
    .format(now)
    .toUpperCase()

  // Visits this month (any status — total clinical activity)
  const { count: visitsCount } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('visit_date', monthStartDate)

  // Distinct patients seen this month
  const { data: distinctPatients } = await supabase
    .from('visits')
    .select('patient_id')
    .eq('clinic_id', clinicId)
    .gte('visit_date', monthStartDate)

  const uniquePatients = new Set((distinctPatients ?? []).map((row) => row.patient_id)).size

  // Total revenue collected this month (paid payments only)
  let revenueThisMonthUgx: number | null = null
  const { data: payments, error: paymentsErr } = await supabase
    .from('payments')
    .select('amount_ugx')
    .eq('clinic_id', clinicId)
    .eq('status', 'paid')
    .gte('created_at', monthStartIso)

  if (!paymentsErr && payments) {
    revenueThisMonthUgx = payments.reduce((sum, row) => sum + (row.amount_ugx ?? 0), 0)
  }

  // Average documentation duration this month — checked_in_at → documentation_completed_at
  let avgVisitSeconds: number | null = null
  const { data: timedVisits } = await supabase
    .from('visits')
    .select('checked_in_at, documentation_completed_at')
    .eq('clinic_id', clinicId)
    .eq('documentation_complete', true)
    .gte('visit_date', monthStartDate)
    .not('checked_in_at', 'is', null)
    .not('documentation_completed_at', 'is', null)

  if (timedVisits && timedVisits.length > 0) {
    const total = timedVisits.reduce((acc, row) => {
      const start = row.checked_in_at ? new Date(row.checked_in_at).getTime() : 0
      const end = row.documentation_completed_at ? new Date(row.documentation_completed_at).getTime() : 0
      const dur = (end - start) / 1000
      return Number.isFinite(dur) && dur > 0 ? acc + dur : acc
    }, 0)
    if (total > 0) avgVisitSeconds = total / timedVisits.length
  }

  return {
    monthLabel,
    visitsThisMonth: visitsCount ?? 0,
    uniquePatientsThisMonth: uniquePatients,
    revenueThisMonthUgx,
    avgVisitSeconds,
  }
}

function formatUgx(value: number | null): string {
  if (value === null || value === 0) return '—'
  if (value >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `UGX ${(value / 1_000).toFixed(0)}K`
  return `UGX ${value.toLocaleString()}`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

export default async function ReportsOverviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  const metrics = await getAnalystMetrics(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Overview"
        subtitle={`DATA · ${metrics.monthLabel}`}
        actions={
          <>
            <div className="bg-card border border-border rounded-md px-2.5 py-1.5 flex items-center gap-2 text-[13px]">
              <span className="kh-meta">RANGE</span>
              <span className="font-semibold">{metrics.monthLabel.replace(/^\w/, (c) => c.toUpperCase())}</span>
            </div>
            <button className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px] inline-flex items-center gap-1.5 opacity-50 cursor-not-allowed">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button className="bg-cobalt text-white rounded-md px-3.5 py-2 font-semibold text-[13px] opacity-50 cursor-not-allowed">
              + New report
            </button>
          </>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        {/* Headline KPIs — real values from the visits + payments tables. */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <KpiCard
            label={`REVENUE · ${metrics.monthLabel}`}
            value={formatUgx(metrics.revenueThisMonthUgx)}
          />
          <KpiCard
            label="VISITS"
            value={metrics.visitsThisMonth.toLocaleString()}
          />
          <KpiCard
            label="UNIQUE PATIENTS"
            value={metrics.uniquePatientsThisMonth.toLocaleString()}
          />
          <KpiCard
            label="AVG VISIT TIME"
            value={formatDuration(metrics.avgVisitSeconds)}
          />
        </div>

        {/* Report library */}
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-base font-bold tracking-tight">Reports</div>
            <div className="text-xs text-muted-foreground">
              Open a report or browse what's planned next.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          {/* Wired-through: existing reports. */}
          <ReportTile
            tag="COMPLIANCE"
            title="HMIS 105"
            desc="Monthly outpatient submission to the Ministry of Health, with age × sex disaggregation. Required for diocesan subsidies."
            href="/dashboard/admin/reports/hmis105"
          />
          <ReportTile
            tag="QUALITY"
            title="Data quality"
            desc="Find visits missing demographics, diagnosis codes, or AI confirmation before submitting HMIS reports."
            href="/dashboard/admin/reports/data-quality"
          />

          {/* Planned reports — link to coming-soon stubs, no mini-charts or placeholder stats. */}
          <ReportTile
            tag="FINANCIAL"
            title="Clinic profitability"
            desc="Revenue, fees, payouts, and margin per clinic, drillable by service line."
            href="/dashboard/admin/reports/profitability"
          />
          <ReportTile
            tag="CLINICAL"
            title="Disease burden"
            desc="Top diagnoses by month, age band, and clinic. Triggers outbreak alerts."
            href="/dashboard/admin/reports/disease-burden"
          />
          <ReportTile
            tag="POPULATION"
            title="Demographics"
            desc="Age, sex, geography, repeat-visit rate. Catchment vs registered population."
            href="/dashboard/admin/reports/demographics"
          />
          <ReportTile
            tag="CLINICAL"
            title="Care delivered"
            desc="Visits, prescriptions, labs, ANC contacts, vaccinations, referrals."
            href="/dashboard/admin/reports/care-delivered"
          />
          <ReportTile
            tag="QUALITY"
            title="30-day readmission"
            desc="Patients returning within 30 days for the same complaint."
            href="/dashboard/admin/reports/readmission"
          />
          <ReportTile
            tag="MONITORING"
            title="Outbreak watch"
            desc="Continuous monitor that fires when any diagnosis exceeds 2× rolling baseline."
            href="/dashboard/admin/reports/outbreak"
          />
          <ReportTile
            tag="CUSTOM"
            title="Workbench"
            desc="Build your own report. Drag fields, save views, schedule recurring emails."
            href="/dashboard/admin/reports/coming-soon/workbench"
            workbench
          />
        </div>

        <div className="mt-8 text-xs text-muted-foreground max-w-2xl">
          KPIs above are live counts for the current month. Trend lines, cross-clinic compare, and per-report
          drilldowns ship as the analyst aggregation layer is built — see{' '}
          <code className="font-mono text-[11px]">docs/offline-first-refactor.md</code>.
        </div>
      </div>
    </>
  )
}
