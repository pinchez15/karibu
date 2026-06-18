'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordVitals } from './vitals-actions'

// Web vitals capture (#4) — there was no way to record vitals on the web app.
// Nurse step, attachable to the visit. Every field optional; blank = not taken.
const FIELDS: { name: string; label: string; step?: string }[] = [
  { name: 'temp_c', label: 'Temp °C', step: '0.1' },
  { name: 'bp_systolic', label: 'BP sys' },
  { name: 'bp_diastolic', label: 'BP dia' },
  { name: 'pulse_bpm', label: 'Pulse' },
  { name: 'resp_rate', label: 'Resp' },
  { name: 'spo2_pct', label: 'SpO₂ %' },
  { name: 'weight_kg', label: 'Weight kg', step: '0.1' },
  { name: 'height_cm', label: 'Height cm', step: '0.1' },
  { name: 'muac_cm', label: 'MUAC cm', step: '0.1' },
]

export function VitalsCard({ patientId, visitId }: { patientId: string; visitId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSubmit(formData: FormData) {
    setError(null)
    const num = (k: string) => {
      const v = String(formData.get(k) ?? '').trim()
      return v === '' ? null : Number(v)
    }
    start(async () => {
      const r = await recordVitals({
        patientId,
        visitId,
        temp_c: num('temp_c'),
        bp_systolic: num('bp_systolic'),
        bp_diastolic: num('bp_diastolic'),
        pulse_bpm: num('pulse_bpm'),
        resp_rate: num('resp_rate'),
        spo2_pct: num('spo2_pct'),
        weight_kg: num('weight_kg'),
        height_cm: num('height_cm'),
        muac_cm: num('muac_cm'),
        notes: (String(formData.get('notes') ?? '').trim() || null),
      })
      if (!r.success) setError(r.error)
      else {
        setDone(true)
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cobalt" />
          <p className="font-medium">Vitals</p>
          {done && <span className="text-xs text-accent">Saved</span>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : 'Record vitals'}
        </Button>
      </div>

      {open && (
        <form action={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label htmlFor={f.name} className="text-[11px]">{f.label}</Label>
                <Input id={f.name} name={f.name} type="number" step={f.step ?? '1'} inputMode="decimal" />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-[11px]">Notes</Label>
            <Input id="notes" name="notes" placeholder="Optional" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save vitals'}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
