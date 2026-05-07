import { redirect } from 'next/navigation'
import { Download, Sparkles } from 'lucide-react'
import { getStaff, isAdmin } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { Bars, Spark } from './_components/charts'
import { KpiCard } from './_components/kpi-card'
import { ReportTile } from './_components/report-tile'

/**
 * Analyst overview — the new face of /dashboard/admin/reports.
 * Tableau-style: KPI strip + revenue chart + clinic compare + report library tiles.
 *
 * Wired-through reports: HMIS 105 + Data Quality (existing routes).
 * Other tiles route to /dashboard/admin/reports/coming-soon/[slug] until
 * those reports get built (Phase 3 in docs/offline-first-refactor.md and
 * the analyst roadmap that follows).
 *
 * KPI values are still placeholder until the aggregation layer lands.
 * Marking the metric stubs explicitly in the doc so the designer + data
 * team know what's real vs mock.
 */
export default async function ReportsOverviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  // Placeholder series until the data aggregation lands (Phase 3 of the
  // analyst roadmap — separate effort from the design rollout).
  const revenue = [1200, 1450, 1380, 1620, 1850, 1740, 2050, 1980, 2240, 2180, 2410, 2520, 2680, 2810]
  const visitsTrend = [22, 31, 28, 35, 42, 38, 51, 47, 55, 49, 62, 58, 64, 71]
  const dataQuality = [88, 90, 89, 92, 91, 94, 94]

  return (
    <>
      <WebTopBar
        title="Overview"
        subtitle="DATA · MAY 2026 · 3 CLINICS"
        actions={
          <>
            <div className="bg-card border border-border rounded-md px-2.5 py-1.5 flex items-center gap-2 text-[13px]">
              <span className="kh-meta">RANGE</span>
              <span className="font-semibold">1 May – 31 May 2026</span>
              <span className="text-muted-foreground text-[11px]">▾</span>
            </div>
            <button className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px] inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button className="bg-cobalt text-white rounded-md px-3.5 py-2 font-semibold text-[13px]">
              + New report
            </button>
          </>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        {/* Headline KPIs */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <KpiCard label="REVENUE · MAY" value="UGX 28.1M" delta="+12% vs Apr" positive trend={revenue} trendColor="rgb(31 54 199)" />
          <KpiCard label="OPD VISITS" value="1,284" delta="+12%" positive trend={visitsTrend} trendColor="rgb(31 54 199)" />
          <KpiCard label="UNIQUE PATIENTS" value="942" delta="+8%" positive trend={visitsTrend.map((v) => v * 0.8)} trendColor="rgb(40 97 122)" />
          <KpiCard label="AVG VISIT TIME" value="9m 14s" delta="−1m 8s" positive trend={[12, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9.2]} trendColor="rgb(14 138 95)" />
          <KpiCard label="DATA QUALITY" value="94%" delta="+3pp" positive trend={dataQuality} trendColor="rgb(14 138 95)" />
        </div>

        {/* Revenue chart + clinic compare */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-4 mb-5">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex justify-between items-baseline mb-3.5">
              <div>
                <div className="text-sm font-semibold">Revenue · daily</div>
                <div className="text-xs text-muted-foreground">Payments processed through Karibu · last 14 days</div>
              </div>
              <div className="flex gap-1">
                {['14d', '30d', '90d', 'YTD'].map((t, i) => (
                  <span
                    key={t}
                    className={
                      i === 0
                        ? 'text-xs font-medium px-2.5 py-1 rounded bg-cobalt-soft text-cobalt'
                        : 'text-xs font-medium px-2.5 py-1 rounded text-muted-foreground'
                    }
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <Bars values={revenue} color="rgb(31 54 199)" height={140} />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1.5">
              <span>24 APR</span>
              <span>1 MAY</span>
              <span>7 MAY</span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="text-sm font-semibold">Clinic compare · revenue</div>
            <div className="text-xs text-muted-foreground mb-3.5">UGX, last 14 days</div>
            {(
              [
                ['Susunga HC III', 'Pilot', [22, 31, 28, 35, 42, 38, 51, 47, 55, 49, 62, 58, 64, 71], 'rgb(31 54 199)', '28.1M'],
                ['Mityana HC III', 'Active', [18, 24, 22, 28, 30, 27, 34, 32, 38, 36, 40, 39, 42, 45], 'rgb(40 97 122)', '17.4M'],
                ['Kayunga HC III', 'Onboarding', [8, 12, 10, 14, 18, 16, 21, 19, 22, 24, 26, 28, 32, 35], 'rgb(245 165 36)', '9.2M'],
              ] as Array<[string, string, number[], string, string]>
            ).map(([name, status, vals, color, total]) => (
              <div key={name} className="mb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <div>
                    <span className="text-[13px] font-semibold">{name}</span>
                    <span className="text-[11px] text-muted-foreground ml-2">{status}</span>
                  </div>
                  <span className="font-mono text-xs font-bold">UGX {total}</span>
                </div>
                <Bars values={vals} color={color} height={32} />
              </div>
            ))}
          </div>
        </div>

        {/* Report library */}
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-base font-bold tracking-tight">Reports</div>
            <div className="text-xs text-muted-foreground">
              Open a report, drill down, save your view, or build a custom workbench.
            </div>
          </div>
          <div className="flex gap-2">
            <button className="bg-card text-body border border-border rounded-md px-2.5 py-1 text-xs font-medium">
              Standard
            </button>
            <button className="text-muted-foreground rounded-md px-2.5 py-1 text-xs font-medium">My saved</button>
            <button className="text-muted-foreground rounded-md px-2.5 py-1 text-xs font-medium">HMIS</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          <ReportTile
            tag="COMPLIANCE"
            title="HMIS 105"
            desc="Monthly outpatient submission. Data quality gates."
            href="/dashboard/admin/reports/hmis105"
            stats={[
              ['Status', 'Open', 'text-amber'],
              ['Period', 'May 2026'],
            ]}
            mini={
              <div className="flex gap-1 h-[50px] items-end">
                {dataQuality.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[2px] bg-cobalt"
                    style={{ height: `${v}%`, opacity: 0.5 + (v - 85) / 15 }}
                  />
                ))}
              </div>
            }
          />

          <ReportTile
            tag="QUALITY"
            title="Data quality"
            desc="Find missing demographics, uncoded visits, unconfirmed AI suggestions."
            href="/dashboard/admin/reports/data-quality"
            stats={[
              ['Issues', '12', 'text-amber'],
              ['Trend', '−3 wk', 'text-green'],
            ]}
            mini={<Spark values={[18, 16, 15, 14, 12, 12]} color="rgb(245 165 36)" height={50} />}
            hot
          />

          <ReportTile
            tag="FINANCIAL"
            title="Clinic profitability"
            desc="Revenue, fees, payouts, margin per clinic. Drill down by service line."
            href="/dashboard/admin/reports/coming-soon/profitability"
            stats={[
              ['Margin', '34%', 'text-green'],
              ['Net', 'UGX 9.6M'],
            ]}
            mini={<Bars values={[40, 42, 44, 46, 45, 48, 52, 49, 54, 57, 60, 62, 64, 68]} color="rgb(31 54 199)" height={50} />}
          />

          <ReportTile
            tag="CLINICAL"
            title="Disease burden"
            desc="Top diagnoses by month, age band, and clinic. Outbreak watch."
            href="/dashboard/admin/reports/coming-soon/disease-burden"
            stats={[
              ['Malaria', '418', 'text-amber'],
              ['URTI', '162'],
            ]}
            mini={
              <div className="flex items-end gap-1 h-[50px]">
                {[418, 162, 128, 92, 76, 67, 41].map((v, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-[2px] ${i === 0 ? 'bg-amber' : 'bg-slate'}`}
                    style={{ height: `${(v / 418) * 100}%`, opacity: 0.7 }}
                  />
                ))}
              </div>
            }
          />

          <ReportTile
            tag="POPULATION"
            title="Demographics"
            desc="Age, sex, geography, repeat-visit rate. Catchment vs registered."
            href="/dashboard/admin/reports/coming-soon/demographics"
            stats={[
              ['<5 yrs', '24%'],
              ['Female', '58%'],
            ]}
            mini={
              <div className="h-[50px] flex items-end gap-[3px]">
                {[18, 32, 46, 38, 28, 22, 16, 10, 6].map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[2px] bg-slate"
                    style={{ height: `${(v / 46) * 100}%`, opacity: 0.5 + (v / 46) * 0.5 }}
                  />
                ))}
              </div>
            }
          />

          <ReportTile
            tag="CLINICAL"
            title="Care delivered"
            desc="Visits, scripts, labs, ANC visits, vaccinations, referrals."
            href="/dashboard/admin/reports/coming-soon/care-delivered"
            stats={[
              ['Scripts', '1,847'],
              ['Labs', '624'],
            ]}
            mini={<Spark values={[120, 140, 135, 160, 180, 170, 210, 205, 230, 225, 260, 270, 290, 310]} color="rgb(14 138 95)" height={50} />}
          />

          <ReportTile
            tag="QUALITY"
            title="30-day readmission"
            desc="Patients returning within 30 days for the same complaint."
            href="/dashboard/admin/reports/coming-soon/readmission"
            stats={[
              ['Rate', '4.8%', 'text-green'],
              ['Trend', '−0.6pp', 'text-green'],
            ]}
            mini={<Spark values={[6.2, 5.8, 5.6, 5.4, 5.2, 5.1, 4.9, 4.8]} color="rgb(14 138 95)" height={50} />}
          />

          <ReportTile
            tag="MONITORING"
            title="Outbreak watch"
            desc="Triggers an alert if any DX exceeds 2× rolling baseline."
            href="/dashboard/admin/reports/coming-soon/outbreak"
            stats={[
              ['Alerts', '0', 'text-green'],
              ['Watching', '8 dx'],
            ]}
            mini={
              <div className="h-[50px] flex items-center justify-center text-green text-xs font-mono font-semibold">
                <Sparkles className="h-3 w-3 mr-1" /> ALL CLEAR
              </div>
            }
          />

          <ReportTile
            tag="CUSTOM"
            title="Workbench"
            desc="Build your own report. Drag fields. Save views. Schedule emails."
            href="/dashboard/admin/reports/coming-soon/workbench"
            workbench
          />
        </div>
      </div>
    </>
  )
}
