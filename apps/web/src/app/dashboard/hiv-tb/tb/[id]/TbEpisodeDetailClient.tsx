'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { patientDisplayName } from '@/lib/referral-summary'
import { recordTpt, upsertTbEpisode } from '../../actions'

type Episode = {
  id: string
  patient_id: string
  unit_tb_number: string | null
  registered_at: string
  case_type: string
  disease_class: string
  ept_site: string | null
  hiv_status: string | null
  on_art_at_diagnosis: boolean
  on_cpt_at_diagnosis: boolean
  treatment_started_at: string | null
  regimen_category: string | null
  treatment_phase: string | null
  outcome: string
  outcome_date: string | null
  notes: string | null
  patient: {
    id: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    patient_number: string | null
  } | null
}

const OUTCOMES = [
  'ongoing',
  'cured',
  'completed',
  'failure',
  'default',
  'transferred_out',
  'died',
] as const

function formatDate(iso: string): string {
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function TbEpisodeDetailClient({ episode }: { episode: Episode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState(episode.outcome)
  const [outcomeDate, setOutcomeDate] = useState(episode.outcome_date?.slice(0, 10) ?? '')

  const name = episode.patient ? patientDisplayName(episode.patient) : 'Patient'

  function saveOutcome() {
    setError(null)
    startTransition(async () => {
      const res = await upsertTbEpisode({
        id: episode.id,
        patient_id: episode.patient_id,
        case_type: episode.case_type as 'new',
        disease_class: episode.disease_class as 'pulmonary_smear_positive',
        on_art_at_diagnosis: episode.on_art_at_diagnosis,
        on_cpt_at_diagnosis: episode.on_cpt_at_diagnosis,
        outcome: outcome as (typeof OUTCOMES)[number],
        outcome_date: outcomeDate || undefined,
      })
      if (!res.success) setError(res.error)
      else router.refresh()
    })
  }

  function startTpt(indication: 'plhiv' | 'child_contact') {
    setError(null)
    startTransition(async () => {
      const res = await recordTpt({
        patient_id: episode.patient_id,
        indication,
        regimen: '6H',
        completed: false,
      })
      if (!res.success) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registered {formatDate(episode.registered_at)}
          {episode.unit_tb_number && ` · TB #${episode.unit_tb_number}`}
        </p>
        {episode.patient?.id && (
          <Link
            href={`/dashboard/patients/${episode.patient.id}`}
            className="mt-2 inline-block text-sm text-cobalt hover:underline"
          >
            Open patient chart →
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Treatment outcome</h3>
        <div>
          <Label className="text-xs">Outcome</Label>
          <select
            className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        {outcome !== 'ongoing' && (
          <div>
            <Label className="text-xs">Outcome date</Label>
            <Input
              type="date"
              value={outcomeDate}
              onChange={(e) => setOutcomeDate(e.target.value)}
              className="mt-1"
            />
          </div>
        )}
        <Button size="sm" onClick={saveOutcome} disabled={pending}>
          Save outcome
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">TB preventive treatment</h3>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => startTpt('plhiv')}>
          Start TPT (PLHIV)
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => startTpt('child_contact')}>
          Start TPT (child contact)
        </Button>
      </div>
    </div>
  )
}
