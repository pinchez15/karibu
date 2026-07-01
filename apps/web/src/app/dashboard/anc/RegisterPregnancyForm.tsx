'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchPatients } from '@/app/dashboard/actions'
import { startPregnancy } from '@/app/dashboard/anc/actions'
import { patientDisplayName } from '@/lib/referral-summary'
import type { Patient } from '@karibu/shared'
import { cn } from '@/lib/utils'

export function RegisterPregnancyForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [selected, setSelected] = useState<Patient | null>(null)
  const [gestationWeeks, setGestationWeeks] = useState('')
  const [gravida, setGravida] = useState('')
  const [para, setPara] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [hivStatus, setHivStatus] = useState<'negative' | 'positive' | 'unknown' | ''>('')
  const [riskNotes, setRiskNotes] = useState('')
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
      setError('Select the mother first.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await startPregnancy({
        patient_id: selected.id,
        gestation_weeks: gestationWeeks ? Number(gestationWeeks) : undefined,
        gravida: gravida ? Number(gravida) : undefined,
        para: para ? Number(para) : undefined,
        blood_group: bloodGroup || undefined,
        hiv_status: hivStatus || undefined,
        risk_notes: riskNotes || undefined,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/dashboard/anc/${result.pregnancyId}`)
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
          placeholder="Name or patient number…"
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
          Registering: {patientDisplayName(selected)}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium">Gestation (wks)</label>
          <Input
            value={gestationWeeks}
            onChange={(e) => setGestationWeeks(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="e.g. 20"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Gravida</label>
          <Input
            value={gravida}
            onChange={(e) => setGravida(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Para</label>
          <Input
            value={para}
            onChange={(e) => setPara(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Blood group</label>
        <Input
          value={bloodGroup}
          onChange={(e) => setBloodGroup(e.target.value)}
          placeholder="e.g. O+"
          className="mt-1"
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">HIV status</p>
        <div className="flex flex-wrap gap-2">
          {(['negative', 'positive', 'unknown'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setHivStatus(v)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm capitalize',
                hivStatus === v
                  ? 'border-cobalt bg-cobalt/10 text-cobalt font-medium'
                  : 'border-border text-body hover:bg-background',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Risk notes</label>
        <textarea
          value={riskNotes}
          onChange={(e) => setRiskNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          placeholder="High-risk factors, allergies…"
        />
      </div>

      <Button onClick={submit} disabled={pending} className="bg-cobalt hover:bg-cobalt/90">
        {pending ? 'Saving…' : 'Register pregnancy'}
      </Button>
    </div>
  )
}
