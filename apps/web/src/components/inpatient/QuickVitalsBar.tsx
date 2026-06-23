'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { recordAdmissionObservation } from '@/app/dashboard/inpatient/actions'
import type { AdmissionObservation, ObservationInput } from '@/app/dashboard/inpatient/types'
import { checkObservationRanges } from '@/lib/inpatient-danger-signs'
import { timeAgo } from '@/lib/inpatient-format'
import { cn } from '@/lib/utils'

export function QuickVitalsBar({
  admissionId,
  latest,
  onSaved,
  onError,
}: {
  admissionId: string
  latest: AdmissionObservation | null
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [confirmWarnings, setConfirmWarnings] = useState<string[] | null>(null)
  const [pendingInput, setPendingInput] = useState<ObservationInput | null>(null)
  const [temp, setTemp] = useState('')
  const [pulse, setPulse] = useState('')
  const [resp, setResp] = useState('')
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')

  function buildInput(): ObservationInput {
    return {
      tempC: temp ? Number(temp) : null,
      pulseBpm: pulse ? Number(pulse) : null,
      respRate: resp ? Number(resp) : null,
      bpSystolic: sys ? Number(sys) : null,
      bpDiastolic: dia ? Number(dia) : null,
    }
  }

  function save(input: ObservationInput) {
    startTransition(async () => {
      const r = await recordAdmissionObservation(admissionId, input)
      if (!r.success) {
        onError(r.error)
        return
      }
      setTemp('')
      setPulse('')
      setResp('')
      setSys('')
      setDia('')
      setConfirmWarnings(null)
      setPendingInput(null)
      onSaved()
    })
  }

  function trySave() {
    const input = buildInput()
    if (!input.tempC && !input.pulseBpm && !input.respRate && !input.bpSystolic) {
      onError('Enter at least one vital sign.')
      return
    }
    const warnings = checkObservationRanges(input)
    if (warnings.length > 0) {
      setPendingInput(input)
      setConfirmWarnings(warnings)
      return
    }
    save(input)
  }

  const latestLine = latest
    ? [
        latest.temp_c != null ? `T ${latest.temp_c}` : null,
        latest.pulse_bpm != null ? `P ${latest.pulse_bpm}` : null,
        latest.resp_rate != null ? `RR ${latest.resp_rate}` : null,
        latest.bp_systolic != null ? `BP ${latest.bp_systolic}/${latest.bp_diastolic ?? '—'}` : null,
        latest.avpu ? `AVPU ${latest.avpu}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <>
      <div className="rounded-lg border border-border bg-background/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-cobalt uppercase tracking-wide">Vitals</span>
            {latest ? (
              <span className="text-xs text-muted-foreground truncate">
                Last {timeAgo(latest.observed_at)}
                {latestLine ? ` · ${latestLine}` : ''}
              </span>
            ) : (
              <span className="text-xs text-amber-700 font-medium">No obs yet — record now</span>
            )}
          </div>
          <button
            type="button"
            className="text-xs text-cobalt font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Less' : 'More signs'}
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2 items-end">
          <VitalInput label="Temp" value={temp} onChange={setTemp} decimal />
          <VitalInput label="Pulse" value={pulse} onChange={setPulse} />
          <VitalInput label="RR" value={resp} onChange={setResp} />
          <VitalInput label="Sys" value={sys} onChange={setSys} />
          <VitalInput label="Dia" value={dia} onChange={setDia} />
        </div>

        {expanded && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            For AVPU and under-5 danger signs, use the Rounds tab.
          </p>
        )}

        <Button size="sm" className="mt-2 w-full sm:w-auto" disabled={pending} onClick={trySave}>
          {pending ? 'Saving…' : 'Save vitals'}
        </Button>
      </div>

      {confirmWarnings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg">
            <h3 className="font-semibold text-sm">Check these values</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {confirmWarnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmWarnings(null)}>
                Go back
              </Button>
              <Button size="sm" onClick={() => pendingInput && save(pendingInput)} disabled={pending}>
                Save anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function VitalInput({
  label,
  value,
  onChange,
  decimal = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  decimal?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ''))}
        inputMode={decimal ? 'decimal' : 'numeric'}
        className="mt-0.5 h-8 text-sm"
      />
    </div>
  )
}
