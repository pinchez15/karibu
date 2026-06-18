import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'

// Billing unit. Charges (what's owed) + payments (what's paid) → balance.
// Decoupled from clinical closure: recording a payment never gates documentation.
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
    outstanding: Number(row?.outstanding ?? 0),
  }
}

type ChargeRow = {
  id: string
  description: string
  category: string | null
  amount_ugx: number
  created_at: string
  patient: { id: string; display_name: string | null; first_name: string | null; last_name: string | null } | null
}

async function getRecentCharges(clinicId: string): Promise<ChargeRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charges')
    .select('id, description, category, amount_ugx, created_at, patient:patients(id, display_name, first_name, last_name)')
    .eq('clinic_id', clinicId)
    .eq('voided', false)
    .order('created_at', { ascending: false })
    .limit(25)
  if (error) {
    console.error('billing: charges', error)
    return []
  }
  return (data ?? []) as unknown as ChargeRow[]
}

export default async function BillingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'admin') redirect('/dashboard')

  const [cash, charges] = await Promise.all([
    getCashflow(staff.clinic_id),
    getRecentCharges(staff.clinic_id),
  ])

  return (
    <>
      <WebTopBar title="Billing" subtitle="PAYMENTS & CASHFLOW" />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1 space-y-5 max-w-5xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Revenue (month)" value={ugx(cash.revenue)} hint="Payments received" />
          <KpiCard label="Charged (month)" value={ugx(cash.charged)} hint="Billable charges raised" />
          <KpiCard
            label="Outstanding"
            value={ugx(cash.outstanding)}
            hint="Charged − paid"
            warn={cash.outstanding > 0}
          />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold">Recent charges</div>
          {charges.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No charges yet. Charges raised during visits (consultation, lab, pharmacy) appear here.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {charges.map((c) => {
                const name =
                  c.patient?.display_name ||
                  [c.patient?.first_name, c.patient?.last_name].filter(Boolean).join(' ') ||
                  'Unknown patient'
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0">
                      {c.patient ? (
                        <Link href={`/dashboard/patients/${c.patient.id}`} className="font-medium hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="font-medium">{name}</span>
                      )}
                      <span className="text-muted-foreground"> · {c.description}</span>
                    </span>
                    <span className="shrink-0 font-medium">{ugx(c.amount_ugx)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
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
