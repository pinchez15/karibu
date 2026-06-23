import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { NewChargeForm } from './NewChargeForm'
import { listPatientBalances } from './actions'

function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}

async function getCashflow(clinicId: string) {
  const supabase = createServiceClient()
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  const { data, error } = await supabase.rpc('rpc_clinic_cashflow', {
    p_clinic_id: clinicId,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('billing: cashflow', error)
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

export default async function BillingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'admin') redirect('/dashboard')

  const [cash, patients] = await Promise.all([
    getCashflow(staff.clinic_id),
    listPatientBalances(),
  ])

  const withBalance = patients.filter((p) => p.balance > 0)
  const paidUp = patients.filter((p) => p.balance <= 0)

  return (
    <>
      <WebTopBar title="Billing" subtitle="PAYMENTS & CASHFLOW" />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1 space-y-5 max-w-5xl">
        <div className="flex justify-end">
          <NewChargeForm />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Revenue (month)" value={ugx(cash.revenue)} hint="Cash & mobile received" />
          <KpiCard label="Charged (month)" value={ugx(cash.charged)} hint="Billable charges raised" />
          <KpiCard
            label="Outstanding"
            value={ugx(cash.outstanding)}
            hint="Charged − paid (incl. barter)"
            warn={cash.outstanding > 0}
          />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold">
            Patients with balance
          </div>
          {withBalance.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No outstanding balances. Open a patient bill to build charges from their care.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {withBalance.map((p) => (
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
        </div>

        {paidUp.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold text-muted-foreground">
              Recently billed (paid up)
            </div>
            <ul className="divide-y divide-line-soft">
              {paidUp.slice(0, 15).map((p) => (
                <li key={p.patient_id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                  <Link href={`/dashboard/billing/${p.patient_id}`} className="hover:underline">
                    {p.patient_name}
                  </Link>
                  <span className="text-muted-foreground">{ugx(p.charged)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

function KpiCard({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-ink' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}
