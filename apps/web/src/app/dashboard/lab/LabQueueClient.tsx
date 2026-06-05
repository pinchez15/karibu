'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, AlertTriangle, Check, Play } from 'lucide-react'
import { recordLabResult, startLabRun } from './actions'
import { cn } from '@/lib/utils'

export type LabRow = {
  id: string
  visit_date: string
  // For lab the working / suspected diagnosis is the most useful signal —
  // tests are usually ordered to confirm or rule out something. If the
  // clinician hasn't entered a diagnosis yet, fall back to chief complaint.
  chief_complaint: string | null
  diagnosis: string | null
  tests_ordered: string | null
  lab_status: 'not_ordered' | 'pending' | 'running' | 'done' | 'abnormal'
  lab_results: string | null
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
}

export function LabQueueClient({ initialRows }: { initialRows: LabRow[] }) {
  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="px-[18px] py-3.5 flex items-center justify-between border-b border-line-soft">
        <div>
          <div className="text-sm font-semibold">Pending + running</div>
          <div className="text-xs text-muted-foreground">
            {initialRows.length} {initialRows.length === 1 ? 'order' : 'orders'} · oldest first
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1.4fr_1.6fr_2fr_1fr_1.2fr] gap-3 px-[18px] py-2 kh-meta border-b border-line-soft">
        <span>PATIENT</span>
        <span>SUSPECTED DX</span>
        <span>TESTS ORDERED</span>
        <span>RESULT</span>
        <span>STATUS</span>
        <span>ACTIONS</span>
      </div>

      {initialRows.map((row, i) => (
        <LabRowItem key={row.id} row={row} last={i === initialRows.length - 1} />
      ))}
    </div>
  )
}

function LabRowItem({ row, last }: { row: LabRow; last: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState(row.lab_results ?? '')

  const fullName = [row.patient.first_name, row.patient.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.patient.display_name || 'Unknown'

  const ageBand = formatAge(row.patient.date_of_birth)
  const sexBand = row.patient.sex?.[0]?.toUpperCase() ?? ''
  const meta = [
    row.patient.patient_number ?? `PT-${row.patient.id.slice(0, 6)}`,
    [ageBand, sexBand].filter(Boolean).join(''),
  ]
    .filter(Boolean)
    .join(' · ')

  function handleStart() {
    setError(null)
    startTransition(async () => {
      const r = await startLabRun(row.id)
      if (!r.success) setError(r.error)
    })
  }

  function handleSave(abnormal: boolean) {
    setError(null)
    if (!result.trim()) {
      setError('Enter a result before saving')
      return
    }
    startTransition(async () => {
      const r = await recordLabResult(row.id, result, abnormal)
      if (!r.success) setError(r.error)
    })
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[1.4fr_1.4fr_1.6fr_2fr_1fr_1.2fr] gap-3 px-[18px] py-3 text-[13px] items-start',
        !last && 'border-b border-line-soft',
        pending && 'opacity-60',
      )}
    >
      <div>
        <Link href={`/dashboard/patients/${row.patient.id}`} className="font-semibold hover:underline block">
          {fullName}
        </Link>
        <div className="text-[11px] text-muted-foreground font-mono">{meta}</div>
        {row.doctor?.display_name && (
          <div className="text-[11px] text-muted-foreground mt-1">
            Ordered by {row.doctor.display_name}
          </div>
        )}
      </div>
      <div className="text-body whitespace-pre-wrap leading-snug">
        {row.diagnosis ? (
          <span>{row.diagnosis}</span>
        ) : row.chief_complaint ? (
          <span className="italic text-muted-foreground">{row.chief_complaint}</span>
        ) : (
          '—'
        )}
      </div>
      <div className="text-body whitespace-pre-wrap leading-relaxed">
        {row.tests_ordered || '—'}
      </div>
      <div>
        <textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="Enter result. e.g. RDT positive (Pf), Hb 11.2 g/dL, urine clear"
          rows={2}
          className="w-full text-[12px] border border-border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      <div>
        <StatusPill status={row.lab_status} abnormal={row.lab_abnormal} />
      </div>
      <div className="space-y-1.5">
        {row.lab_status === 'pending' && (
          <button
            onClick={handleStart}
            disabled={pending}
            className="bg-cobalt-soft text-cobalt rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Play className="h-3 w-3" /> Start run
          </button>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleSave(false)}
            disabled={pending}
            className="bg-green text-white rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={pending}
            className="bg-amber text-amber-ink rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" /> Abnormal
          </button>
        </div>
        {error && <div className="text-[11px] text-destructive">{error}</div>}
      </div>
    </div>
  )
}

function StatusPill({
  status,
  abnormal,
}: {
  status: LabRow['lab_status']
  abnormal: boolean
}) {
  if (abnormal) {
    return (
      <span className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold bg-amber-soft text-amber-ink">
        Abnormal
      </span>
    )
  }
  const config: Record<LabRow['lab_status'], { label: string; cls: string }> = {
    not_ordered: { label: '—', cls: 'bg-line-soft text-muted-foreground' },
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
