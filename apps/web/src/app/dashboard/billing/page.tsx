import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { NewChargeForm } from './NewChargeForm'
import { listPatientBalances } from './actions'
import { computeBalance } from '@/lib/billing-balance'

function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}

export default async function BillingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const patients = await listPatientBalances()
  // WP3 D1: derive the displayed balance through the shared util (from the RPC's
  // charged/paid aggregates) so an overpay/prepay never shows as a negative owed
  // amount here while the bill page shows a credit.
  const rows = patients.map((p) => ({
    ...p,
    ...computeBalance([{ amount_ugx: p.charged }], [{ amount_ugx: p.paid }]),
  }))
  const withBalance = rows.filter((p) => p.remaining > 0)
  const paidUp = rows.filter((p) => p.remaining <= 0)

  return (
    <>
      <WebTopBar title="Payments" subtitle="PATIENT BILLS" />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1 space-y-5 max-w-5xl">
        <div className="flex justify-end">
          <NewChargeForm />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold">
            Patients with balance
          </div>
          {withBalance.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No outstanding balances. Charges appear when labs complete or pharmacy dispenses.
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
                      {ugx(p.paid)} paid · {ugx(p.charged)} total
                    </span>
                    <span className="font-semibold text-amber-ink">{ugx(p.remaining)} owed</span>
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
