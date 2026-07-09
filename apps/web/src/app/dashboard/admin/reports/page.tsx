import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { getClinicSimpleMetrics } from '@/lib/clinic-simple-metrics'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { ReportTile } from './_components/report-tile'
import { RegisterMetricCard, RegisterSection } from './_components/register-metrics'

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

function formatUgx(n: number): string {
  if (n === 0) return 'UGX 0'
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `UGX ${Math.round(n / 1_000)}K`
  return `UGX ${n.toLocaleString('en-US')}`
}

export default async function ReportsOverviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const m = await getClinicSimpleMetrics(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Clinic register"
        subtitle={`DATA · ${m.todayLabel}`}
        actions={
          <Link
            href="/dashboard/billing/reports"
            className="rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-background"
          >
            Full cashflow →
          </Link>
        }
      />
      <RealtimeRefresher clinicId={staff.clinic_id} />

      <div className="p-6 overflow-auto flex-1 space-y-8 max-w-5xl">
        <p className="text-sm text-muted-foreground -mt-2">
          Simple counts like the paper register — OPD cases reset each calendar month; inpatient
          admissions keep running totals.
        </p>

        <RegisterSection title="Today" subtitle={m.todayLabel}>
          <RegisterMetricCard
            label="OPD cases"
            value={formatCount(m.today.opdVisits)}
            hint="Outpatient visits checked in today"
            accent="cobalt"
          />
          <RegisterMetricCard
            label="Income collected"
            value={formatUgx(m.today.revenueUgx)}
            hint="Cash & mobile money received today"
            accent="green"
          />
          <RegisterMetricCard
            label="New admissions"
            value={formatCount(m.today.admissions)}
            hint="Patients admitted to the ward today"
            accent="slate"
          />
          <RegisterMetricCard
            label="In ward now"
            value={formatCount(m.activeInpatients)}
            hint="Active inpatient admissions"
            accent="slate"
          />
        </RegisterSection>

        <RegisterSection
          title={`This month — ${m.monthLabel.replace(/^\w/, (c) => c.toUpperCase())}`}
          subtitle="OPD count starts again on the 1st of each month"
        >
          <RegisterMetricCard
            label="OPD cases"
            value={formatCount(m.month.opdVisits)}
            hint="Outpatient visits since month start"
            accent="cobalt"
          />
          <RegisterMetricCard
            label="Income collected"
            value={formatUgx(m.month.revenueUgx)}
            hint="Cash & mobile received this month"
            accent="green"
          />
          <RegisterMetricCard
            label="Admissions"
            value={formatCount(m.month.admissions)}
            hint="Ward admissions this month (no monthly reset)"
            accent="slate"
          />
          <RegisterMetricCard
            label="Unique patients"
            value={formatCount(m.month.uniquePatients)}
            hint="Distinct OPD patients this month"
          />
        </RegisterSection>

        <RegisterSection title={`${m.year} — year to date`} subtitle="Running totals since 1 January">
          <RegisterMetricCard
            label="OPD cases"
            value={formatCount(m.yearToDate.opdVisits)}
            accent="cobalt"
          />
          <RegisterMetricCard
            label="Income collected"
            value={formatUgx(m.yearToDate.revenueUgx)}
            accent="green"
          />
          <RegisterMetricCard
            label="Admissions"
            value={formatCount(m.yearToDate.admissions)}
            accent="slate"
          />
          <RegisterMetricCard
            label="Billed this month"
            value={formatUgx(m.month.chargedUgx)}
            hint="Charges raised (may differ from collections)"
          />
        </RegisterSection>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Detailed reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              HMIS submissions, diagnosis breakdowns, and data quality checks.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <ReportTile
              tag="COMPLIANCE"
              title="HMIS 105"
              desc="Monthly outpatient form for the Ministry of Health."
              href="/dashboard/admin/reports/hmis105"
            />
            <ReportTile
              tag="COMPLIANCE"
              title="HMIS 106a HIV"
              desc="Quarterly HIV/TB program report for DHIS2 (HTS, ART, VL)."
              href="/dashboard/admin/reports/hmis106a-hiv"
            />
            <ReportTile
              tag="COMPLIANCE"
              title="HMIS 106a TB"
              desc="Quarterly TB/Leprosy case-finding, outcomes, and TPT."
              href="/dashboard/admin/reports/hmis106a-tb"
            />
            <ReportTile
              tag="QUALITY"
              title="Data quality"
              desc="Visits missing codes or demographics before HMIS submit."
              href="/dashboard/admin/reports/data-quality"
            />
            <ReportTile
              tag="CLINICAL"
              title="Care delivered"
              desc="Prescriptions, labs, and referrals this month."
              href="/dashboard/admin/reports/care-delivered"
            />
            <ReportTile
              tag="COMPLIANCE"
              title="Inpatient monthly summary (HMIS 108 alignment pending verification)"
              desc="Admissions, discharge outcomes, deliveries, and bed-days by month."
              href="/dashboard/admin/reports/inpatient-monthly"
            />
            <ReportTile
              tag="FINANCIAL"
              title="Clinic profitability"
              desc="Revenue and charges by service line this month."
              href="/dashboard/admin/reports/profitability"
            />
            <ReportTile
              tag="CLINICAL"
              title="Disease burden"
              desc="Top diagnoses by month and age band."
              href="/dashboard/admin/reports/disease-burden"
            />
            <ReportTile
              tag="POPULATION"
              title="Demographics"
              desc="Age, sex, and repeat-visit patterns."
              href="/dashboard/admin/reports/demographics"
            />
            <ReportTile
              tag="QUALITY"
              title="30-day readmission"
              desc="Patients returning within 30 days."
              href="/dashboard/admin/reports/readmission"
            />
            <ReportTile
              tag="MONITORING"
              title="Outbreak watch"
              desc="Diagnosis spikes above rolling baseline."
              href="/dashboard/admin/reports/outbreak"
            />
          </div>
        </section>
      </div>
    </>
  )
}
