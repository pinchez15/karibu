'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  addCharge,
  generateChargesFromVisit,
  voidCharge,
  recordBillingPayment,
  type PatientChargeRow,
  type PatientPaymentRow,
  type PatientVisitOption,
} from '../actions'

const CATEGORIES = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'lab', label: 'Lab' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'barter', label: 'Barter only' },
  { value: 'mixed', label: 'Cash + barter' },
]

function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}

function categoryLabel(c: string | null): string {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c ?? '—'
}

type Props = {
  patientId: string
  patientName: string
  balance: { charged: number; paid: number; balance: number }
  charges: PatientChargeRow[]
  payments: PatientPaymentRow[]
  visits: PatientVisitOption[]
}

export function PatientBillClient({
  patientId,
  patientName,
  balance,
  charges,
  payments,
  visits,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [visitId, setVisitId] = useState(visits[0]?.id ?? '')
  const [manualCategory, setManualCategory] = useState('other')
  const [manualDesc, setManualDesc] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payCash, setPayCash] = useState('')
  const [payBarter, setPayBarter] = useState('')
  const [payBarterDesc, setPayBarterDesc] = useState('')

  const activeCharges = charges.filter((c) => !c.voided)

  function run(fn: () => Promise<{ success: false; error: string } | { success: true }>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.success) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{patientName}</h2>
          <p className="text-sm text-muted-foreground">Patient bill</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/dashboard/billing/${patientId}/receipt`} target="_blank" rel="noopener noreferrer">
              Print receipt
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/billing">All patients</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BalanceCard label="Charged" value={ugx(balance.charged)} />
        <BalanceCard label="Paid" value={ugx(balance.paid)} hint="Cash + barter credit" />
        <BalanceCard
          label="Balance"
          value={ugx(balance.balance)}
          warn={balance.balance > 0}
        />
      </div>

      {/* Build from visit */}
      {visits.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Build bill from care</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pulls consultation fee, completed lab tests, and dispensed pharmacy (qty × stock price).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={visitId}
              onChange={(e) => setVisitId(e.target.value)}
              className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <Button
              disabled={pending || !visitId}
              onClick={() =>
                run(async () => {
                  const r = await generateChargesFromVisit(patientId, visitId)
                  if (!r.success) return r
                  return { success: true as const }
                })
              }
            >
              {pending ? 'Adding…' : 'Add charges from visit'}
            </Button>
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold">Charges</div>
        {activeCharges.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No charges yet. Build from a visit or add a line manually below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium text-right">Qty</th>
                  <th className="px-2 py-2 font-medium text-right">Unit</th>
                  <th className="px-2 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {activeCharges.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.description}</td>
                    <td className="px-2 py-2 text-muted-foreground">{categoryLabel(c.category)}</td>
                    <td className="px-2 py-2 text-right">{c.quantity}</td>
                    <td className="px-2 py-2 text-right">
                      {c.unit_price_ugx != null ? ugx(c.unit_price_ugx) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">{ugx(c.amount_ugx)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm('Remove this charge from the bill?')) return
                          run(() => voidCharge(patientId, c.id))
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual line */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Add line manually</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-[11px]">Type</Label>
            <select
              value={manualCategory}
              onChange={(e) => setManualCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[11px]">Description</Label>
            <Input value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Amount (UGX)</Label>
            <Input type="number" min="0" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={pending || !manualDesc.trim() || manualAmount === ''}
            onClick={() =>
              run(() =>
                addCharge({
                  patientId,
                  category: manualCategory,
                  description: manualDesc,
                  amountUgx: Number(manualAmount),
                }),
              )
            }
          >
            Add line
          </Button>
        </div>
      </div>

      {/* Record payment */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Record payment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Partial payments allowed. Use mixed or barter when the patient pays with goods and cash.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-[11px]">Method</Label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Cash / mobile (UGX)</Label>
            <Input
              type="number"
              min="0"
              value={payCash}
              onChange={(e) => setPayCash(e.target.value)}
              disabled={payMethod === 'barter'}
            />
          </div>
          <div>
            <Label className="text-[11px]">Barter value (UGX)</Label>
            <Input
              type="number"
              min="0"
              value={payBarter}
              onChange={(e) => setPayBarter(e.target.value)}
              disabled={payMethod === 'cash' || payMethod === 'mtn_momo' || payMethod === 'airtel_money'}
            />
          </div>
          <div>
            <Label className="text-[11px]">Barter description</Label>
            <Input
              value={payBarterDesc}
              onChange={(e) => setPayBarterDesc(e.target.value)}
              placeholder="e.g. 2 kg maize"
              disabled={payMethod !== 'barter' && payMethod !== 'mixed'}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const cash =
                  payMethod === 'barter' ? 0 : Number(payCash || 0)
                const barter =
                  payMethod === 'cash' || payMethod === 'mtn_momo' || payMethod === 'airtel_money'
                    ? 0
                    : Number(payBarter || 0)
                const r = await recordBillingPayment({
                  patientId,
                  amountCashUgx: cash,
                  amountBarterUgx: barter,
                  paymentMethod: payMethod,
                  barterDescription: payBarterDesc,
                })
                if (!r.success) return r
                setPayCash('')
                setPayBarter('')
                setPayBarterDesc('')
                return { success: true as const }
              })
            }
          >
            {pending ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-line-soft text-sm font-semibold">Payments</div>
          <ul className="divide-y divide-line-soft">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString('en-GB')}
                  {p.receipt_number && ` · #${p.receipt_number}`}
                </span>
                <span>
                  {p.amount_ugx > 0 && <span>{ugx(p.amount_ugx)} cash</span>}
                  {p.amount_barter_ugx > 0 && (
                    <span className="text-muted-foreground">
                      {p.amount_ugx > 0 ? ' + ' : ''}
                      {ugx(p.amount_barter_ugx)} barter
                      {p.barter_description ? ` (${p.barter_description})` : ''}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function BalanceCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? 'text-amber-ink' : ''}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
