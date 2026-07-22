'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordVitals } from './vitals-actions'

// Web vitals capture (#4) — there was no way to record vitals on the web app.
// Nurse step, attachable to the visit. Every field optional; blank = not taken.
type VitalNumericField = Exclude<keyof VisitVitalsReading, 'notes' | 'recorded_at'>

const FIELDS: { name: VitalNumericField; label: string; step?: string; unit?: string }[] = [
  { name: 'temp_c', label: 'Temp', step: '0.1', unit: '°C' },
  { name: 'bp_systolic', label: 'BP sys', unit: 'mmHg' },
  { name: 'bp_diastolic', label: 'BP dia', unit: 'mmHg' },
  { name: 'pulse_bpm', label: 'Pulse', unit: '/min' },
  { name: 'resp_rate', label: 'Resp', unit: '/min' },
  { name: 'spo2_pct', label: 'SpO₂', unit: '%' },
  { name: 'weight_kg', label: 'Weight', step: '0.1', unit: 'kg' },
  { name: 'height_cm', label: 'Height', step: '0.1', unit: 'cm' },
  { name: 'muac_cm', label: 'MUAC', step: '0.1', unit: 'cm' },
]

export type VisitVitalsReading = {
  temp_c: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  pulse_bpm: number | null
  resp_rate: number | null
  spo2_pct: number | null
  weight_kg: number | null
  height_cm: number | null
  muac_cm: number | null
  notes: string | null
  recorded_at?: string | null
}

function formatVital(value: number | null | undefined, unit?: string): string | null {
  if (value == null || Number.isNaN(value)) return null
  return unit ? `${value}${unit}` : String(value)
}

function hasAnyVital(v: VisitVitalsReading | null | undefined): boolean {
  if (!v) return false
  return FIELDS.some((f) => v[f.name] != null) || Boolean(v.notes?.trim())
}

export function VitalsCard({
  patientId,
  visitId,
  latestVitals = null,
}: {
  patientId: string
  visitId: string
  latestVitals?: VisitVitalsReading | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Optimistic local copy so values stay visible immediately after save,
  // before the server refresh returns.
  const [vitals, setVitals] = useState<VisitVitalsReading | null>(latestVitals)

  useEffect(() => {
    setVitals(latestVitals)
  }, [latestVitals])

  function handleSubmit(formData: FormData) {
    setError(null)
    const num = (k: string) => {
      const v = String(formData.get(k) ?? '').trim()
      return v === '' ? null : Number(v)
    }
    const next: VisitVitalsReading = {
      temp_c: num('temp_c'),
      bp_systolic: num('bp_systolic'),
      bp_diastolic: num('bp_diastolic'),
      pulse_bpm: num('pulse_bpm'),
      resp_rate: num('resp_rate'),
      spo2_pct: num('spo2_pct'),
      weight_kg: num('weight_kg'),
      height_cm: num('height_cm'),
      muac_cm: num('muac_cm'),
      notes: String(formData.get('notes') ?? '').trim() || null,
      recorded_at: new Date().toISOString(),
    }
    start(async () => {
      const r = await recordVitals({
        patientId,
        visitId,
        ...next,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setVitals(next)
      setOpen(false)
      router.refresh()
    })
  }

  const showReading = hasAnyVital(vitals)
  const bpSys = formatVital(vitals?.bp_systolic ?? null)
  const bpDia = formatVital(vitals?.bp_diastolic ?? null)
  const bpDisplay =
    bpSys && bpDia ? `${bpSys}/${bpDia}` : bpSys ? `${bpSys}/—` : bpDia ? `—/${bpDia}` : null

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cobalt" />
          <p className="font-medium">Vitals</p>
          {showReading && !open && (
            <span className="text-xs text-muted-foreground">
              {vitals?.recorded_at
                ? `Recorded ${new Date(vitals.recorded_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Recorded'}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : showReading ? 'Update vitals' : 'Record vitals'}
        </Button>
      </div>

      {showReading && !open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {bpDisplay && (
            <div>
              <p className="text-[11px] text-muted-foreground">BP</p>
              <p className="font-medium font-mono text-sm">{bpDisplay}</p>
            </div>
          )}
          {FIELDS.filter((f) => f.name !== 'bp_systolic' && f.name !== 'bp_diastolic').map((f) => {
            const formatted = formatVital(vitals?.[f.name] ?? null, f.unit)
            if (!formatted) return null
            return (
              <div key={f.name}>
                <p className="text-[11px] text-muted-foreground">{f.label}</p>
                <p className="font-medium font-mono text-sm">{formatted}</p>
              </div>
            )
          })}
          {vitals?.notes?.trim() && (
            <div className="col-span-full">
              <p className="text-[11px] text-muted-foreground">Notes</p>
              <p className="text-sm">{vitals.notes}</p>
            </div>
          )}
        </div>
      )}

      {open && (
        <form action={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label htmlFor={f.name} className="text-[11px]">
                  {f.label}
                  {f.unit ? ` ${f.unit}` : ''}
                </Label>
                <Input
                  id={f.name}
                  name={f.name}
                  type="number"
                  step={f.step ?? '1'}
                  inputMode="decimal"
                  defaultValue={vitals?.[f.name] ?? undefined}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-[11px]">
              Notes
            </Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Optional"
              defaultValue={vitals?.notes ?? undefined}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save vitals'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
