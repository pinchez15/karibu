import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { listPatientBalances, type PatientBalanceRow } from '../actions'

function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}

type PeriodCashflow = {
  label: string
  revenue: number
  charged: number
  outstanding: number
}

function monthPeriods(count: number): { label: string; from: string; to: string }[] {
  const now = new Date()
  const periods: { label: string; from: string; to: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    periods.push({
      label: start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    })
  }
  return periods
}

function quarterPeriods(year: number): { label: string; from: string; to: string }[] {
  return [
    { label: `Q1 ${year}`, from: `${year}-01-01`, to: `${year}-03-31` },
    { label: `Q2 ${year}`, from: `${year}-04-01`, to: `${year}-06-30` },
    { label: `Q3 ${year}`, from: `${year}-07-01`, to: `${year}-09-30` },
    { label: `Q4 ${year}`, from: `${year}-10-01`, to: `${year}-12-31` },
  ]
}

async function cashflowForPeriod(
  clinicId: string,
  from: string,
  to: string,
): Promise<{ revenue: number; charged: number; outstanding: number }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_clinic_cashflow', {
    p_clinic_id: clinicId,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('billing reports: cashflow', error)
    return { revenue: 0, charged: 0, outstanding: 0 }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { revenue: number; charged: number; outstanding: number }
    | undefined
  return {
    revenue: Number(row?.revenue ?? 0),
    charged: Number(row?.charged ?? 0),
    outstanding: Math.max(0, Number(row?.outstanding ?? 0)),
  }
}

async function getMonthlyCashflow(clinicId: string): Promise<PeriodCashflow[]> {
  const periods = monthPeriods(6)
  const rows = await Promise.all(
    periods.map(async (p) => {
      const cash = await cashflowForPeriod(clinicId, p.from, p.to)
      return { label: p.label, ...cash }
    }),
  )
  return rows
}

async function getQuarterlyCashflow(clinicId: string): Promise<PeriodCashflow[]> {
  const year = new Date().getFullYear()
  const periods = quarterPeriods(year)
  const rows = await Promise.all(
    periods.map(async (p) => {
      const cash = await cashflowForPeriod(clinicId, p.from, p.to)
      return { label: p.label, ...cash }
    }),
  )
  return rows
}

function collectionsSummary(patients: PatientBalanceRow[]) {
  const owing = patients.filter((p) => p.balance > 0)
  return {
    totalOutstanding: owing.reduce((s, p) => s + p.balance, 0),
    patientCount: owing.length,
    owing: owing.sort((a, b) => b.balance - a.balance),
  }
}

export default async function BillingReportsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'admin') redirect('/dashboard')

  const [monthly, quarterly, patients] = await Promise.all([
    getMonthlyCashflow(staff.clinic_id),
    getQuarterlyCashflow(staff.clinic_id),
    listPatientBalances(),
  ])

  const collections = collectionsSummary(patients)
  const currentMonth = monthly[monthly.length - 1]

  return (
    <>
      <WebTopBar title="Reports" subtitle="BILLING & CASHFLOW" />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1 space-y-6 max-w-5xl">
        {currentMonth && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Revenue (this month)"
              value={ugx(currentMonth.revenue)}
              hint="Cash & mobile received"
            />
            <KpiCard label="Charged (this month)" value={ugx(currentMonth.charged)} hint="Billable charges raised" />
            <KpiCard
              label="Outstanding (this month)"
              value={ugx(currentMonth.outstanding)}
              hint="Charged − paid in period"
              warn={currentMonth.outstanding > 0}
            />
          </div>
        )}

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft">
            <h2 className="text-sm font-semibold">Revenue by month</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Last six calendar months</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2 font-medium text-right">Charged</th>
                  <th className="px-4 py-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {monthly.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2.5 font-medium">{row.label}</td>
                    <td className="px-4 py-2.5 text-right">{ugx(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{ugx(row.charged)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={row.outstanding > 0 ? 'text-amber-ink font-medium' : ''}>
                        {ugx(row.outstanding)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft">
            <h2 className="text-sm font-semibold">Totals by quarter</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{new Date().getFullYear()} calendar year</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Quarter</th>
                  <th className="px-4 py-2 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2 font-medium text-right">Charged</th>
                  <th className="px-4 py-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {quarterly.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2.5 font-medium">{row.label}</td>
                    <td className="px-4 py-2.5 text-right">{ugx(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{ugx(row.charged)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={row.outstanding > 0 ? 'text-amber-ink font-medium' : ''}>
                        {ugx(row.outstanding)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-soft bg-background/50 font-semibold">
                  <td className="px-4 py-2.5">Year to date</td>
                  <td className="px-4 py-2.5 text-right">{ugx(quarterly.reduce((s, r) => s + r.revenue, 0))}</td>
                  <td className="px-4 py-2.5 text-right">{ugx(quarterly.reduce((s, r) => s + r.charged, 0))}</td>
                  <td className="px-4 py-2.5 text-right">
                    {ugx(quarterly.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Collections needed</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Patients with unpaid balances — {collections.patientCount} patient
                {collections.patientCount === 1 ? '' : 's'},{' '}
                <span className="font-medium text-amber-ink">{ugx(collections.totalOutstanding)}</span> total
              </p>
            </div>
          </div>
          {collections.owing.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              All patients are paid up. Nothing to collect.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {collections.owing.map((p) => (
                <li key={p.patient_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <Link
                    href={`/dashboard/billing/${p.patient_id}`}
                    className="min-w-0 font-medium hover:underline"
                  >
                    {p.patient_name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-4">
                    <span className="text-muted-foreground hidden sm:inline">
                      {ugx(p.paid)} paid of {ugx(p.charged)}
                    </span>
                    <span className="font-semibold text-amber-ink">{ugx(p.balance)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function KpiCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: string
  hint: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-ink' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}
