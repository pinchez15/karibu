'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateClinicBillingRates, type ClinicBillingRates } from './actions'

export function BillingRatesClient({ initial }: { initial: ClinicBillingRates }) {
  const [consultationFee, setConsultationFee] = useState(String(initial.consultation_fee_ugx))
  const [markup, setMarkup] = useState(String(initial.pharmacy_markup_percent))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Consultation fee</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-added when billing pulls charges from a visit. Set to 0 if OPD consultation is free
            at your facility.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="consultation_fee">Fee per visit (UGX)</Label>
          <Input
            id="consultation_fee"
            type="number"
            min={0}
            step={1}
            value={consultationFee}
            onChange={(e) => {
              setConsultationFee(e.target.value)
              setSaved(false)
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Pharmacy markup</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Percent added to stock unit price when pharmacy charges are raised.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pharmacy_markup">Markup (%)</Label>
          <Input
            id="pharmacy_markup"
            type="number"
            min={0}
            max={200}
            step={1}
            value={markup}
            onChange={(e) => {
              setMarkup(e.target.value)
              setSaved(false)
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Lab test prices</h3>
        <p className="text-xs text-muted-foreground">
          Patient charges for labs (e.g. MRDT) use the <strong>unit price</strong> on each lab stock
          item when set; otherwise the national catalog default applies (MRDT = UGX 1,500).
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/lab/stock">Open lab stock prices</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green">Saved. New visit charges will use these rates.</p>}

      <Button
        disabled={pending}
        onClick={() => {
          setError(null)
          setSaved(false)
          start(async () => {
            const r = await updateClinicBillingRates({
              consultationFeeUgx: Math.round(Number(consultationFee || 0)),
              pharmacyMarkupPercent: Math.round(Number(markup || 0)),
            })
            if (!r.success) {
              setError(r.error)
              return
            }
            setSaved(true)
          })
        }}
        className="gap-2"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save billing rates
      </Button>
    </div>
  )
}
