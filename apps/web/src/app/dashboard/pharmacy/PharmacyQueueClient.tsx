'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Loader2, AlertTriangle, PackageX } from 'lucide-react'
import { setDispensingStatus } from './actions'
import { cn } from '@/lib/utils'

export type DispensingRow = {
  id: string
  visit_date: string
  // Diagnosis takes priority on the dispenser view (pharmacy gets orders
  // after a diagnosis is made — the chief complaint they typed in at
  // intake is rarely useful for dispensing). Keep chief_complaint as a
  // fallback for pre-documentation rows that somehow leak through.
  diagnosis: string | null
  chief_complaint: string | null
  medications: string | null
  dispensing_status: 'not_started' | 'in_progress' | 'dispensed' | 'partial' | 'out_of_stock'
  dispense_notes: string | null
  documentation_completed_at: string | null
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
    date_of_birth: string | null
    sex: string | null
    whatsapp_number: string | null
  }
}

/**
 * Pharmacy queue with single-tap dispensing actions.
 *
 * Optimistic-update pattern: each row tracks its own pending state, server
 * action revalidates the path on success. On failure, we surface the error
 * inline and the row stays in its prior state.
 */
export function PharmacyQueueClient({ initialRows }: { initialRows: DispensingRow[] }) {
  const [rows] = useState(initialRows)
  const visible = rows

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="px-[18px] py-3.5 flex items-center justify-between border-b border-line-soft">
        <div>
          <div className="text-sm font-semibold">Awaiting dispensing</div>
          <div className="text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? 'patient' : 'patients'} · oldest first
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr_2fr_0.9fr_1.4fr] gap-3 px-[18px] py-2 kh-meta border-b border-line-soft">
        <span>PATIENT</span>
        <span>DIAGNOSIS</span>
        <span>MEDICATIONS</span>
        <span>STATUS</span>
        <span>ACTIONS</span>
      </div>

      {visible.map((row, i) => (
        <PharmacyRow key={row.id} row={row} last={i === visible.length - 1} />
      ))}
    </div>
  )
}

function PharmacyRow({ row, last }: { row: DispensingRow; last: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(row.dispense_notes ?? '')

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

  function dispatch(status: 'dispensed' | 'partial' | 'out_of_stock') {
    setError(null)
    startTransition(async () => {
      const result = await setDispensingStatus(row.id, status, notes || undefined)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[1.4fr_1fr_2fr_0.9fr_1.4fr] gap-3 px-[18px] py-3 text-[13px] items-start',
        !last && 'border-b border-line-soft',
        pending && 'opacity-60',
      )}
    >
      <div>
        <Link
          href={`/dashboard/visits/${row.id}`}
          className="font-semibold hover:underline block"
        >
          {fullName}
        </Link>
        <div className="text-[11px] text-muted-foreground font-mono">{meta}</div>
      </div>
      <div className="text-body">{row.diagnosis || row.chief_complaint || '—'}</div>
      <div className="text-body whitespace-pre-wrap leading-relaxed">
        {row.medications || '—'}
      </div>
      <div>
        <StatusPill status={row.dispensing_status} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => dispatch('dispensed')}
            disabled={pending}
            className="bg-green text-white rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Dispensed
          </button>
          <button
            onClick={() => dispatch('partial')}
            disabled={pending}
            className="bg-amber-soft text-amber-ink border border-amber/30 rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" /> Partial
          </button>
          <button
            onClick={() => dispatch('out_of_stock')}
            disabled={pending}
            className="bg-red-soft text-red border border-red/30 rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <PackageX className="h-3 w-3" /> Out
          </button>
        </div>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-body underline"
          onClick={() => setShowNotes((v) => !v)}
        >
          {showNotes ? 'Hide note' : 'Add note'}
        </button>
        {showNotes && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Substituted Co-trimoxazole for Amoxicillin (out of stock)"
            rows={2}
            className="w-full text-[11px] border border-border rounded-md px-2 py-1.5 bg-background"
          />
        )}
        {error && (
          <div className="text-[11px] text-destructive">{error}</div>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: DispensingRow['dispensing_status'] }) {
  const config: Record<DispensingRow['dispensing_status'], { label: string; cls: string }> = {
    not_started: { label: 'Waiting', cls: 'bg-line-soft text-muted-foreground' },
    in_progress: { label: 'In progress', cls: 'bg-cobalt-soft text-cobalt' },
    dispensed: { label: 'Dispensed', cls: 'bg-green-soft text-green' },
    partial: { label: 'Partial', cls: 'bg-amber-soft text-amber-ink' },
    out_of_stock: { label: 'Out of stock', cls: 'bg-red-soft text-red' },
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
