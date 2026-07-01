'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { patientDisplayName } from '@/lib/referral-summary'
import { recordViralLoad, upsertHivCare } from '../../actions'

type Enrollment = {
  id: string
  patient_id: string
  enrolled_at: string
  care_status: string
  who_stage: number | null
  art_start_date: string | null
  art_regimen: string | null
  art_line: string | null
  cpt_at_last_visit: boolean
  tb_assessed_last_visit: boolean
  tb_treatment_started: boolean
  eligible_not_on_art: boolean
  notes: string | null
  patient: {
    id: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    patient_number: string | null
    sex: string | null
  } | null
}

type VlTest = {
  id: string
  test_date: string
  result_copies: number | null
  suppressed: boolean | null
  notes: string | null
}

function formatDate(iso: string): string {
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function HivCareDetailClient({
  enrollment,
  vlTests,
}: {
  enrollment: Enrollment
  vlTests: VlTest[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [vlCopies, setVlCopies] = useState('')
  const [vlDate, setVlDate] = useState('')

  const name = enrollment.patient ? patientDisplayName(enrollment.patient) : 'Patient'

  function updateFlags(flags: {
    cpt_at_last_visit?: boolean
    tb_assessed_last_visit?: boolean
    tb_treatment_started?: boolean
    care_status?: 'pre_art' | 'on_art'
  }) {
    setError(null)
    startTransition(async () => {
      const res = await upsertHivCare({
        id: enrollment.id,
        patient_id: enrollment.patient_id,
        care_status: flags.care_status ?? (enrollment.care_status as 'pre_art' | 'on_art'),
        who_stage: enrollment.who_stage ?? undefined,
        art_start_date:
          flags.care_status === 'on_art' && !enrollment.art_start_date
            ? new Date().toISOString().slice(0, 10)
            : enrollment.art_start_date ?? undefined,
        art_regimen: enrollment.art_regimen ?? (flags.care_status === 'on_art' ? 'TLD' : undefined),
        art_line: (enrollment.art_line as 'first' | 'second') ?? undefined,
        pregnant_at_enrollment: false,
        eligible_not_on_art: enrollment.eligible_not_on_art,
        cpt_at_last_visit: flags.cpt_at_last_visit ?? enrollment.cpt_at_last_visit,
        tb_assessed_last_visit: flags.tb_assessed_last_visit ?? enrollment.tb_assessed_last_visit,
        tb_treatment_started: flags.tb_treatment_started ?? enrollment.tb_treatment_started,
      })
      if (!res.success) setError(res.error)
      else router.refresh()
    })
  }

  function addVl() {
    setError(null)
    startTransition(async () => {
      const res = await recordViralLoad({
        patient_id: enrollment.patient_id,
        enrollment_id: enrollment.id,
        test_date: vlDate || undefined,
        result_copies: vlCopies ? Number(vlCopies) : undefined,
      })
      if (!res.success) setError(res.error)
      else {
        setVlCopies('')
        setVlDate('')
        router.refresh()
      }
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enrolled {formatDate(enrollment.enrolled_at)} ·{' '}
          {enrollment.care_status === 'on_art' ? 'On ART' : 'Pre-ART'}
          {enrollment.art_regimen && ` · ${enrollment.art_regimen}`}
        </p>
        {enrollment.patient?.id && (
          <Link
            href={`/dashboard/patients/${enrollment.patient.id}`}
            className="mt-2 inline-block text-sm text-cobalt hover:underline"
          >
            Open patient chart →
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Visit flags (HMIS 106a)</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enrollment.cpt_at_last_visit}
            disabled={pending}
            onChange={(e) => updateFlags({ cpt_at_last_visit: e.target.checked })}
          />
          CPT at last visit
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enrollment.tb_assessed_last_visit}
            disabled={pending}
            onChange={(e) => updateFlags({ tb_assessed_last_visit: e.target.checked })}
          />
          TB screened at last visit
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enrollment.tb_treatment_started}
            disabled={pending}
            onChange={(e) => updateFlags({ tb_treatment_started: e.target.checked })}
          />
          Started TB treatment this quarter
        </label>
        {enrollment.care_status === 'pre_art' && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => updateFlags({ care_status: 'on_art' })}
          >
            Start ART (today)
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Viral load</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Test date</Label>
            <Input type="date" value={vlDate} onChange={(e) => setVlDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Copies/mL</Label>
            <Input
              type="number"
              value={vlCopies}
              onChange={(e) => setVlCopies(e.target.value)}
              placeholder="e.g. 450"
              className="mt-1"
            />
          </div>
        </div>
        <Button size="sm" onClick={addVl} disabled={pending}>
          Record viral load
        </Button>
        {vlTests.length > 0 && (
          <ul className="divide-y text-sm">
            {vlTests.map((vl) => (
              <li key={vl.id} className="py-2 flex justify-between">
                <span>{formatDate(vl.test_date)}</span>
                <span>
                  {vl.result_copies != null ? `${vl.result_copies} cp/mL` : '—'}
                  {vl.suppressed === true && ' · suppressed'}
                  {vl.suppressed === false && ' · not suppressed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
