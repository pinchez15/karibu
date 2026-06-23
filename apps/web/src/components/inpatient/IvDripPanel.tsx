'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  recordIvInfusionCheck,
  startIvInfusion,
  stopIvInfusion,
} from '@/app/dashboard/inpatient/actions'
import type { IvInfusion, IvInfusionCheck } from '@/app/dashboard/inpatient/types'
import {
  IV_ADDITIVES,
  IV_FLUIDS,
  IV_VOLUME_PRESETS_ML,
  additiveLabel,
  estimateMlRemaining,
  fluidLabel,
  hoursRemaining,
} from '@/lib/inpatient-iv-catalog'
import { timeAgo } from '@/lib/inpatient-format'
import { cn } from '@/lib/utils'

export function IvDripPanel({
  admissionId,
  infusions,
  checks,
  onRefresh,
  onError,
}: {
  admissionId: string
  infusions: IvInfusion[]
  checks: IvInfusionCheck[]
  onRefresh: () => void
  onError: (msg: string) => void
}) {
  const [showStart, setShowStart] = useState(false)
  const [pending, startTransition] = useTransition()

  const active = infusions.filter((i) => i.active)

  function quickCheck(infusionId: string, dripRunning: boolean, siteOk: boolean) {
    startTransition(async () => {
      const r = await recordIvInfusionCheck(admissionId, infusionId, { dripRunning, siteOk })
      if (!r.success) onError(r.error)
      else onRefresh()
    })
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-background/80 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-cobalt uppercase tracking-wide">
            IV drips
            {active.length > 0 && (
              <span className="ml-1.5 rounded-full bg-cobalt-soft text-cobalt px-1.5 py-px text-[10px]">
                {active.length} running
              </span>
            )}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowStart(true)}>
            + Start drip
          </Button>
        </div>

        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active infusions.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((inf) => (
              <IvDripCard
                key={inf.id}
                infusion={inf}
                lastCheck={checks.find((c) => c.infusion_id === inf.id)}
                pending={pending}
                onCheckOk={() => quickCheck(inf.id, true, true)}
                onCheckProblem={() => quickCheck(inf.id, false, false)}
                onStop={() => {
                  startTransition(async () => {
                    const r = await stopIvInfusion(admissionId, inf.id)
                    if (!r.success) onError(r.error)
                    else onRefresh()
                  })
                }}
              />
            ))}
          </div>
        )}
      </div>

      <StartIvSheet
        open={showStart}
        onOpenChange={setShowStart}
        admissionId={admissionId}
        onSaved={() => {
          setShowStart(false)
          onRefresh()
        }}
        onError={onError}
      />
    </>
  )
}

function IvDripCard({
  infusion,
  lastCheck,
  pending,
  onCheckOk,
  onCheckProblem,
  onStop,
}: {
  infusion: IvInfusion
  lastCheck?: IvInfusionCheck
  pending: boolean
  onCheckOk: () => void
  onCheckProblem: () => void
  onStop: () => void
}) {
  const remaining = estimateMlRemaining(infusion.volume_ml, infusion.rate_ml_hr, infusion.started_at)
  const hrsLeft = hoursRemaining(infusion.volume_ml, infusion.rate_ml_hr, infusion.started_at)
  const add = additiveLabel(infusion.additive)
  const needsCheck =
    !lastCheck || Date.now() - new Date(lastCheck.checked_at).getTime() > 2 * 60 * 60 * 1000

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2 text-xs min-w-[180px] max-w-[220px]',
        needsCheck ? 'border-amber-400 bg-amber-50/50' : 'border-border bg-card',
      )}
    >
      <p className="font-semibold leading-tight">{fluidLabel(infusion.fluid_type)}</p>
      {add && <p className="text-[10px] text-muted-foreground">+ {add}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">
        {infusion.volume_ml} ml
        {infusion.rate_ml_hr ? ` · ${infusion.rate_ml_hr} ml/hr` : ''}
        {infusion.drops_per_min ? ` · ${infusion.drops_per_min} gtt/min` : ''}
        {remaining != null ? ` · ~${remaining} ml left` : ''}
        {hrsLeft != null && hrsLeft < 2 ? (
          <span className="text-amber-700 font-medium"> · bag ending soon</span>
        ) : null}
      </p>
      {infusion.site_location && (
        <p className="text-[10px] text-muted-foreground">Site: {infusion.site_location}</p>
      )}
      {lastCheck && (
        <p className={cn('text-[10px] mt-0.5', lastCheck.drip_running && lastCheck.site_ok ? 'text-muted-foreground' : 'text-destructive')}>
          Checked {timeAgo(lastCheck.checked_at)}
          {!lastCheck.drip_running && ' · drip stopped'}
          {!lastCheck.site_ok && ' · site issue'}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Button size="sm" className="h-6 text-[10px] flex-1" disabled={pending} onClick={onCheckOk}>
          ✓ OK
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" disabled={pending} onClick={onCheckProblem}>
          Issue
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={pending} onClick={onStop}>
          Stop
        </Button>
      </div>
    </div>
  )
}

function StartIvSheet({
  open,
  onOpenChange,
  admissionId,
  onSaved,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  admissionId: string
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [fluid, setFluid] = useState('normal_saline')
  const [additive, setAdditive] = useState('none')
  const [volume, setVolume] = useState('1000')
  const [rate, setRate] = useState('')
  const [drops, setDrops] = useState('')
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Start IV drip</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <div>
            <label className="text-sm font-medium">Fluid</label>
            <select
              value={fluid}
              onChange={(e) => setFluid(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {IV_FLUIDS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Additive</label>
            <select
              value={additive}
              onChange={(e) => setAdditive(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {IV_ADDITIVES.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Volume (ml)</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {IV_VOLUME_PRESETS_ML.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVolume(String(v))}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs',
                    volume === String(v) ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-border',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Input value={volume} onChange={(e) => setVolume(e.target.value.replace(/\D/g, ''))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Rate (ml/hr)</label>
              <Input value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Drops/min</label>
              <Input value={drops} onChange={(e) => setDrops(e.target.value.replace(/\D/g, ''))} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Cannula site</label>
            <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. right hand" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </div>
          <Button
            className="w-full"
            disabled={pending || !volume}
            onClick={() => {
              startTransition(async () => {
                const r = await startIvInfusion(admissionId, {
                  fluidType: fluid,
                  volumeMl: Number(volume),
                  additive,
                  rateMlHr: rate ? Number(rate) : undefined,
                  dropsPerMin: drops ? Number(drops) : undefined,
                  siteLocation: site,
                  notes,
                })
                if (!r.success) onError(r.error)
                else onSaved()
              })
            }}
          >
            {pending ? 'Starting…' : 'Start drip'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
