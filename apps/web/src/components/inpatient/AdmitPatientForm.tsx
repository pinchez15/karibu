'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchPatients } from '@/app/dashboard/actions'
import { admitPatient } from '@/app/dashboard/inpatient/actions'
import { patientDisplayName } from '@/lib/referral-summary'
import type { Patient } from '@karibu/shared'
import { cn } from '@/lib/utils'

export function AdmitPatientForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [selected, setSelected] = useState<Patient | null>(null)
  const [ward, setWard] = useState<'general' | 'maternity'>('general')
  const [bedLabel, setBedLabel] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [gravida, setGravida] = useState('')
  const [para, setPara] = useState('')
  const [gestationWeeks, setGestationWeeks] = useState('')
  const [presentingStatus, setPresentingStatus] = useState('')
  const [hivStatus, setHivStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSearchChange(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    void searchPatients(value.trim()).then((hits) => {
      setResults(hits)
      setSearching(false)
    })
  }

  function submit() {
    if (!selected) {
      setError('Select a patient to admit.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await admitPatient({
        patientId: selected.id,
        ward,
        bedLabel: bedLabel || undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        chiefComplaint: chiefComplaint || undefined,
        gravida: gravida ? Number(gravida) : undefined,
        para: para ? Number(para) : undefined,
        gestationWeeks: gestationWeeks ? Number(gestationWeeks) : undefined,
        presentingStatus: presentingStatus || undefined,
        hivStatus: hivStatus || undefined,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/dashboard/inpatient/${result.admissionId}`)
    })
  }

  return (
    <div className="max-w-xl space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <label className="text-sm font-medium">Search patient</label>
        <Input
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Name…"
          className="mt-1"
        />
        {searching && <p className="mt-1 text-xs text-muted-foreground">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y rounded-md border border-border bg-card">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-background"
                  onClick={() => {
                    setSelected(p)
                    setResults([])
                    setQuery(patientDisplayName(p))
                  }}
                >
                  {patientDisplayName(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-card p-3 text-sm font-medium">
          Admitting: {patientDisplayName(selected)}
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Ward</p>
        <div className="flex gap-2">
          {(['general', 'maternity'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWard(w)}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-sm font-medium',
                ward === w
                  ? 'border-cobalt bg-cobalt-soft text-cobalt'
                  : 'border-border bg-card text-body',
              )}
            >
              {w === 'maternity' ? 'Maternity' : 'General'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Bed</label>
          <Input value={bedLabel} onChange={(e) => setBedLabel(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">Weight (kg)</label>
          <Input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Reason for admission</label>
        <textarea
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {ward === 'maternity' && (
        <div className="space-y-3 rounded-xl border border-line-soft bg-muted/20 p-4">
          <p className="text-sm font-semibold">Maternity</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium">Gravida</label>
              <Input
                value={gravida}
                onChange={(e) => setGravida(e.target.value.replace(/\D/g, ''))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Para</label>
              <Input
                value={para}
                onChange={(e) => setPara(e.target.value.replace(/\D/g, ''))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">GA (wk)</label>
              <Input
                value={gestationWeeks}
                onChange={(e) => setGestationWeeks(e.target.value.replace(/\D/g, ''))}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Presenting</label>
            <Input
              value={presentingStatus}
              onChange={(e) => setPresentingStatus(e.target.value)}
              placeholder="in labour / postnatal / referred-in"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium">HIV status (from ANC card)</label>
            <Input value={hivStatus} onChange={(e) => setHivStatus(e.target.value)} className="mt-1" />
          </div>
        </div>
      )}

      <Button onClick={submit} disabled={!selected || pending} className="w-full">
        {pending ? 'Admitting…' : 'Admit to ward'}
      </Button>
    </div>
  )
}
