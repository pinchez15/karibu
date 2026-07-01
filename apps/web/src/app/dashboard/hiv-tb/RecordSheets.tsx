'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { searchPatients } from '@/app/dashboard/actions'
import { patientDisplayName } from '@/lib/referral-summary'
import type { Patient } from '@karibu/shared'
import {
  recordHtsEvent,
  upsertHivCare,
  upsertTbEpisode,
} from './actions'

function PatientPicker({
  selected,
  onSelect,
}: {
  selected: Patient | null
  onSelect: (p: Patient | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)

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

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <span className="text-sm font-medium">{patientDisplayName(selected)}</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onSelect(null)}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search name or patient number…"
      />
      {searching && <p className="mt-1 text-xs text-muted-foreground">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-auto divide-y rounded-md border border-border bg-card">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-background"
                onClick={() => {
                  onSelect(p)
                  setResults([])
                  setQuery('')
                }}
              >
                {patientDisplayName(p)}
                {p.patient_number && (
                  <span className="ml-2 text-muted-foreground">#{p.patient_number}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RecordHtsSheet({
  open,
  onOpenChange,
  defaultPatientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPatientId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState(true)
  const [result, setResult] = useState<'negative' | 'positive' | 'indeterminate'>('negative')
  const [resultReceived, setResultReceived] = useState(true)
  const [suspectedTb, setSuspectedTb] = useState(false)
  const [startedCpt, setStartedCpt] = useState(false)
  const [retester, setRetester] = useState(false)

  function save() {
    const patientId = patient?.id ?? defaultPatientId
    if (!patientId) {
      setError('Select a patient.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await recordHtsEvent({
        patient_id: patientId,
        counseled: true,
        tested,
        result: tested ? result : 'not_tested',
        result_received: resultReceived,
        first_result_in_fy: false,
        suspected_tb: suspectedTb,
        started_cpt: startedCpt,
        retester,
        couple_test: false,
        pep: false,
        smc_provided: false,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record HTS event</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!defaultPatientId && (
            <div>
              <Label>Patient</Label>
              <div className="mt-1">
                <PatientPicker selected={patient} onSelect={setPatient} />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tested} onChange={(e) => setTested(e.target.checked)} />
            Tested for HIV
          </label>
          {tested && (
            <>
              <div>
                <Label>Result</Label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  value={result}
                  onChange={(e) => setResult(e.target.value as typeof result)}
                >
                  <option value="negative">Negative</option>
                  <option value="positive">Positive</option>
                  <option value="indeterminate">Indeterminate</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resultReceived}
                  onChange={(e) => setResultReceived(e.target.checked)}
                />
                Result received by client
              </label>
              {result === 'positive' && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={suspectedTb}
                      onChange={(e) => setSuspectedTb(e.target.checked)}
                    />
                    Suspected TB
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={startedCpt}
                      onChange={(e) => setStartedCpt(e.target.checked)}
                    />
                    Started CPT
                  </label>
                </>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={retester} onChange={(e) => setRetester(e.target.checked)} />
            Re-tester (2+ tests in 12 months)
          </label>
          <Button onClick={save} disabled={pending} className="w-full">
            {pending ? 'Saving…' : 'Save HTS record'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function RecordHivCareSheet({
  open,
  onOpenChange,
  defaultPatientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPatientId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [careStatus, setCareStatus] = useState<'pre_art' | 'on_art'>('pre_art')
  const [whoStage, setWhoStage] = useState('')
  const [artRegimen, setArtRegimen] = useState('TLD')
  const [artStart, setArtStart] = useState('')
  const [cpt, setCpt] = useState(false)
  const [tbScreened, setTbScreened] = useState(false)

  function save() {
    const patientId = patient?.id ?? defaultPatientId
    if (!patientId) {
      setError('Select a patient.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await upsertHivCare({
        patient_id: patientId,
        care_status: careStatus,
        who_stage: whoStage ? Number(whoStage) : undefined,
        art_regimen: careStatus === 'on_art' ? artRegimen : undefined,
        art_start_date: careStatus === 'on_art' ? artStart || undefined : undefined,
        art_line: careStatus === 'on_art' ? 'first' : undefined,
        pregnant_at_enrollment: false,
        eligible_not_on_art: false,
        cpt_at_last_visit: cpt,
        tb_assessed_last_visit: tbScreened,
        tb_treatment_started: false,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      onOpenChange(false)
      router.push(`/dashboard/hiv-tb/hiv/${res.id}`)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Enroll / update HIV care</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!defaultPatientId && (
            <div>
              <Label>Patient</Label>
              <div className="mt-1">
                <PatientPicker selected={patient} onSelect={setPatient} />
              </div>
            </div>
          )}
          <div>
            <Label>Care status</Label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={careStatus}
              onChange={(e) => setCareStatus(e.target.value as typeof careStatus)}
            >
              <option value="pre_art">Pre-ART</option>
              <option value="on_art">On ART</option>
            </select>
          </div>
          <div>
            <Label>WHO stage</Label>
            <Input
              type="number"
              min={1}
              max={4}
              value={whoStage}
              onChange={(e) => setWhoStage(e.target.value)}
              className="mt-1"
            />
          </div>
          {careStatus === 'on_art' && (
            <>
              <div>
                <Label>ART regimen</Label>
                <Input value={artRegimen} onChange={(e) => setArtRegimen(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>ART start date</Label>
                <Input type="date" value={artStart} onChange={(e) => setArtStart(e.target.value)} className="mt-1" />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cpt} onChange={(e) => setCpt(e.target.checked)} />
            CPT at last visit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tbScreened} onChange={(e) => setTbScreened(e.target.checked)} />
            TB screened at last visit
          </label>
          <Button onClick={save} disabled={pending} className="w-full">
            {pending ? 'Saving…' : 'Save enrollment'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function RecordTbSheet({
  open,
  onOpenChange,
  defaultPatientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPatientId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unitNumber, setUnitNumber] = useState('')
  const [caseType, setCaseType] = useState<'new' | 'relapse' | 'retreatment_default' | 'failure' | 'other'>('new')
  const [diseaseClass, setDiseaseClass] = useState<
    'pulmonary_smear_positive' | 'pulmonary_smear_negative' | 'extrapulmonary'
  >('pulmonary_smear_positive')
  const [hivStatus, setHivStatus] = useState<'positive' | 'negative' | 'unknown'>('unknown')
  const [treatmentStart, setTreatmentStart] = useState('')

  function save() {
    const patientId = patient?.id ?? defaultPatientId
    if (!patientId) {
      setError('Select a patient.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await upsertTbEpisode({
        patient_id: patientId,
        unit_tb_number: unitNumber || undefined,
        case_type: caseType,
        disease_class: diseaseClass,
        hiv_status: hivStatus,
        on_art_at_diagnosis: false,
        on_cpt_at_diagnosis: false,
        treatment_started_at: treatmentStart || undefined,
        regimen_category: 'cat1',
        treatment_phase: 'intensive',
        outcome: 'ongoing',
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      onOpenChange(false)
      router.push(`/dashboard/hiv-tb/tb/${res.id}`)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Register TB case</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!defaultPatientId && (
            <div>
              <Label>Patient</Label>
              <div className="mt-1">
                <PatientPicker selected={patient} onSelect={setPatient} />
              </div>
            </div>
          )}
          <div>
            <Label>Unit TB number</Label>
            <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Case type</Label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value as typeof caseType)}
            >
              <option value="new">New</option>
              <option value="relapse">Relapse</option>
              <option value="retreatment_default">Retreatment after default</option>
              <option value="failure">Treatment failure</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>Disease classification</Label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={diseaseClass}
              onChange={(e) => setDiseaseClass(e.target.value as typeof diseaseClass)}
            >
              <option value="pulmonary_smear_positive">Pulmonary smear-positive</option>
              <option value="pulmonary_smear_negative">Pulmonary smear-negative</option>
              <option value="extrapulmonary">Extrapulmonary</option>
            </select>
          </div>
          <div>
            <Label>HIV status</Label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={hivStatus}
              onChange={(e) => setHivStatus(e.target.value as typeof hivStatus)}
            >
              <option value="unknown">Unknown</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </select>
          </div>
          <div>
            <Label>Treatment start date</Label>
            <Input type="date" value={treatmentStart} onChange={(e) => setTreatmentStart(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={save} disabled={pending} className="w-full">
            {pending ? 'Saving…' : 'Register TB case'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
