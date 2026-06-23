'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { recordMedicationAdmin } from '@/app/dashboard/inpatient/actions'
import type { MedicationAdmin, MedicationOrder } from '@/app/dashboard/inpatient/types'
import { buildDoseSchedule, type DoseSlot } from '@/lib/inpatient-dose-schedule'
import { cn } from '@/lib/utils'

const NOT_GIVEN = ['Out of stock', 'Refused', 'Nil by mouth', 'Patient absent', 'Other']

export function DueNowPanel({
  admissionId,
  orders,
  admins,
  onRefresh,
  onError,
  onAddMed,
}: {
  admissionId: string
  orders: MedicationOrder[]
  admins: MedicationAdmin[]
  onRefresh: () => void
  onError: (msg: string) => void
  onAddMed: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [notGiven, setNotGiven] = useState<DoseSlot | null>(null)

  const { dueNow, prn } = useMemo(
    () => buildDoseSchedule(orders, admins),
    [orders, admins],
  )

  function passDose(slot: DoseSlot, given: boolean, reason?: string) {
    startTransition(async () => {
      const r = await recordMedicationAdmin(
        admissionId,
        slot.orderId,
        given,
        reason,
        slot.scheduledFor.toISOString(),
      )
      if (!r.success) onError(r.error)
      else onRefresh()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background/80 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-cobalt uppercase tracking-wide">
          Due now
          {dueNow.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-soft text-amber-ink px-1.5 py-px text-[10px]">
              {dueNow.length}
            </span>
          )}
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddMed}>
          + Med
        </Button>
      </div>

      {dueNow.length === 0 && prn.length === 0 ? (
        <p className="text-xs text-muted-foreground">No medications due.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dueNow.map((slot) => (
            <DoseChip
              key={`${slot.orderId}-${slot.label}`}
              slot={slot}
              pending={pending}
              onGive={() => passDose(slot, true)}
              onNotGiven={() => setNotGiven(slot)}
            />
          ))}
          {prn.map((o) => (
            <div
              key={o.id}
              className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium">{o.drug_name}</span>
              <span className="text-muted-foreground ml-1">PRN</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-2 h-6 text-[10px] px-2"
                disabled={pending}
                onClick={() =>
                  passDose(
                    {
                      orderId: o.id,
                      drugName: o.drug_name,
                      dose: o.dose,
                      route: o.route,
                      frequency: o.frequency,
                      scheduledFor: new Date(),
                      label: 'PRN',
                      status: 'due',
                    },
                    true,
                  )
                }
              >
                Given
              </Button>
            </div>
          ))}
        </div>
      )}

      {notGiven && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-4 shadow-lg">
            <p className="text-sm font-semibold">
              {notGiven.drugName} — not given?
            </p>
            <div className="mt-2 space-y-1">
              {NOT_GIVEN.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                  onClick={() => {
                    passDose(notGiven, false, r)
                    setNotGiven(null)
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setNotGiven(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DoseChip({
  slot,
  pending,
  onGive,
  onNotGiven,
}: {
  slot: DoseSlot
  pending: boolean
  onGive: () => void
  onNotGiven: () => void
}) {
  const overdue = slot.status === 'overdue'
  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-xs min-w-[140px]',
        overdue ? 'border-destructive/50 bg-red-50' : 'border-border bg-card',
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-semibold truncate">{slot.drugName}</span>
        <span className={cn('shrink-0 font-mono', overdue && 'text-destructive')}>{slot.label}</span>
      </div>
      {(slot.dose || slot.route) && (
        <p className="text-[10px] text-muted-foreground truncate">
          {[slot.dose, slot.route].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="mt-1 flex gap-1">
        <Button size="sm" className="h-6 flex-1 text-[10px]" disabled={pending} onClick={onGive}>
          Pass
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 flex-1 text-[10px]"
          disabled={pending}
          onClick={onNotGiven}
        >
          Skip
        </Button>
      </div>
    </div>
  )
}
