'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, AlertTriangle, Play } from 'lucide-react'
import {
  labTestSupportsPosNeg,
  type LabTestResultRow,
  type LabTestStatus,
} from '@karibu/shared'
import { recordLabTestResult, startLabTest } from './actions'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { cn } from '@/lib/utils'

export type LabVisitRow = {
  id: string
  visit_date: string
  chief_complaint: string | null
  diagnosis: string | null
  tests_ordered: string | null
  lab_status: 'not_ordered' | 'pending' | 'running' | 'done' | 'abnormal'
  lab_results: string | null
  lab_test_results?: LabTestResultRow[] | null
  lab_abnormal: boolean
  doctor_id: string | null
  doctor: { display_name: string | null } | null
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
    date_of_birth: string | null
    sex: string | null
  }
  tests: LabTestResultRow[]
}

export function LabQueueClient({ initialRows }: { initialRows: LabVisitRow[] }) {
  useAutoRefresh()

  const openTestCount = useMemo(
    () =>
      initialRows.reduce(
        (n, row) => n + row.tests.filter((t) => t.status === 'pending' || t.status === 'running').length,
        0,
      ),
    [initialRows],
  )

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="px-[18px] py-3.5 flex items-center justify-between border-b border-line-soft">
        <div>
          <div className="text-sm font-semibold">Pending + running</div>
          <div className="text-xs text-muted-foreground">
            {openTestCount} {openTestCount === 1 ? 'test' : 'tests'} · {initialRows.length}{' '}
            {initialRows.length === 1 ? 'patient' : 'patients'} · oldest first
          </div>
        </div>
      </div>

      <div className="divide-y divide-line-soft">
        {initialRows.map((visit) => (
          <PatientLabGroup key={visit.id} visit={visit} />
        ))}
      </div>
    </div>
  )
}

function PatientLabGroup({ visit }: { visit: LabVisitRow }) {
  const openTests = visit.tests.filter((t) => t.status === 'pending' || t.status === 'running')
  if (openTests.length === 0) return null

  const fullName =
    [visit.patient.first_name, visit.patient.last_name].filter(Boolean).join(' ').trim() ||
    visit.patient.display_name ||
    'Unknown'

  const ageBand = formatAge(visit.patient.date_of_birth)
  const sexBand = visit.patient.sex?.[0]?.toUpperCase() ?? ''
  const meta = [
    visit.patient.patient_number ?? `PT-${visit.patient.id.slice(0, 6)}`,
    [ageBand, sexBand].filter(Boolean).join(''),
  ]
    .filter(Boolean)
    .join(' · ')

  const dx = visit.diagnosis ?? visit.chief_complaint

  return (
    <div className="px-[18px] py-3">
      <div className="mb-3">
        <Link
          href={`/dashboard/patients/${visit.patient.id}`}
          className="font-semibold text-[13px] hover:underline"
        >
          {fullName}
        </Link>
        <div className="text-[11px] text-muted-foreground font-mono">{meta}</div>
        {dx && (
          <div className="text-[12px] text-body mt-1 leading-snug">
            <span className="text-muted-foreground">Suspected: </span>
            {visit.diagnosis ? dx : <span className="italic">{dx}</span>}
          </div>
        )}
        {visit.doctor?.display_name && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Ordered by {visit.doctor.display_name}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1.6fr_2fr_0.9fr_2.4fr] gap-3 px-1 py-1.5 kh-meta border-b border-line-soft">
        <span>TEST</span>
        <span>RESULT</span>
        <span>STATUS</span>
        <span>ACTIONS</span>
      </div>

      <div className="divide-y divide-line-soft/70">
        {openTests.map((test) => (
          <LabTestRow key={`${visit.id}-${test.test}`} visitId={visit.id} test={test} />
        ))}
      </div>
    </div>
  )
}

function LabTestRow({ visitId, test }: { visitId: string; test: LabTestResultRow }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState(test.result ?? '')
  const supportsPosNeg = labTestSupportsPosNeg(test.test)

  function handleStart() {
    setError(null)
    startTransition(async () => {
      const r = await startLabTest(visitId, test.test)
      if (!r.success) setError(r.error)
    })
  }

  function handleSave(value: string, abnormal: boolean) {
    setError(null)
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter a result')
      return
    }
    setResult(trimmed)
    startTransition(async () => {
      const r = await recordLabTestResult(visitId, test.test, trimmed, abnormal)
      if (!r.success) setError(r.error)
    })
  }

  function handleQuick(label: 'Positive' | 'Negative', abnormal: boolean) {
    handleSave(label, abnormal)
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[1.6fr_2fr_0.9fr_2.4fr] gap-3 px-1 py-2.5 text-[13px] items-center',
        pending && 'opacity-60',
      )}
    >
      <div className="font-medium text-body leading-snug">{test.test}</div>

      <div>
        <input
          type="text"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full text-[12px] border border-border rounded-md px-2 py-1.5 bg-background"
          aria-label={`Result for ${test.test}`}
        />
      </div>

      <div>
        <StatusPill status={test.status} abnormal={test.abnormal} />
      </div>

      <div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {test.status === 'pending' && (
            <button
              onClick={handleStart}
              disabled={pending}
              className="bg-cobalt-soft text-cobalt rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Play className="h-3 w-3" /> Start
            </button>
          )}
          {supportsPosNeg && (
            <>
              <button
                onClick={() => handleQuick('Positive', true)}
                disabled={pending}
                className="bg-card text-body border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Positive
              </button>
              <button
                onClick={() => handleQuick('Negative', false)}
                disabled={pending}
                className="bg-card text-body border border-border rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Negative
              </button>
            </>
          )}
          <button
            onClick={() => handleSave(result, true)}
            disabled={pending}
            className="bg-amber text-amber-ink rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
            Abnormal
          </button>
          {!supportsPosNeg && (
            <button
              onClick={() => handleSave(result, false)}
              disabled={pending}
              className="bg-green text-white rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
        {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
      </div>
    </div>
  )
}

function StatusPill({ status, abnormal }: { status: LabTestStatus; abnormal: boolean }) {
  if (abnormal || status === 'abnormal') {
    return (
      <span className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold bg-amber-soft text-amber-ink">
        Abnormal
      </span>
    )
  }
  const config: Record<LabTestStatus, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-line-soft text-muted-foreground' },
    running: { label: 'Running', cls: 'bg-cobalt-soft text-cobalt' },
    done: { label: 'Done', cls: 'bg-green-soft text-green' },
    abnormal: { label: 'Abnormal', cls: 'bg-amber-soft text-amber-ink' },
  }
  const c = config[status]
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold', c.cls)}>
      {c.label}
    </span>
  )
}

function formatAge(dob: string | null): string {
  if (!dob) return ''
  try {
    const birth = new Date(dob)
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1
    if (years > 0) return `${years}y`
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
    if (months > 0) return `${months}m`
    const days = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
    return `${days}d`
  } catch {
    return ''
  }
}
