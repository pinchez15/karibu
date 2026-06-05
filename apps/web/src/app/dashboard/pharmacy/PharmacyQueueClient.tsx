'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Loader2, AlertTriangle, PackageX, Package, X, Plus } from 'lucide-react'
import { listClinicPharmacyStock, recordDispenseAndStock, setDispensingStatus } from './actions'
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
  const [showDispense, setShowDispense] = useState(false)
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
          href={`/dashboard/patients/${row.patient.id}`}
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
            onClick={() => setShowDispense(true)}
            disabled={pending}
            className="bg-green text-white rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
            Dispense + stock
          </button>
          <button
            onClick={() => dispatch('dispensed')}
            disabled={pending}
            className="bg-green-soft text-green border border-green/30 rounded-md px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
            title="Mark dispensed without recording stock movements"
          >
            <Check className="h-3 w-3" /> Quick mark
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

      {showDispense && (
        <DispenseWithStockDialog
          visitId={row.id}
          medicationsText={row.medications ?? ''}
          initialNotes={notes}
          onClose={() => setShowDispense(false)}
        />
      )}
    </div>
  )
}

type StockOption = Awaited<ReturnType<typeof listClinicPharmacyStock>>[number]

function DispenseWithStockDialog({
  visitId,
  medicationsText,
  initialNotes,
  onClose,
}: {
  visitId: string
  medicationsText: string
  initialNotes: string
  onClose: () => void
}) {
  const [stockOptions, setStockOptions] = useState<StockOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lines, setLines] = useState<Array<{ id: string; stockItemId: string; quantity: string }>>([
    { id: crypto.randomUUID(), stockItemId: '', quantity: '' },
  ])
  const [status, setStatus] = useState<'dispensed' | 'partial' | 'out_of_stock'>('dispensed')
  const [notes, setNotes] = useState(initialNotes)
  const [pending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [partialFailures, setPartialFailures] = useState<string[]>([])

  useEffect(() => {
    listClinicPharmacyStock()
      .then(setStockOptions)
      .catch((e) => setLoadError(e?.message ?? 'Failed to load stock'))
  }, [])

  function addLine() {
    setLines((prev) => [...prev, { id: crypto.randomUUID(), stockItemId: '', quantity: '' }])
  }

  function updateLine(id: string, patch: Partial<{ stockItemId: string; quantity: string }>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))
  }

  function handleSubmit() {
    setSubmitError(null)
    setPartialFailures([])
    const movements = lines
      .filter((l) => l.stockItemId && parseFloat(l.quantity) > 0)
      .map((l) => ({ stockItemId: l.stockItemId, quantity: parseFloat(l.quantity) }))
    if (movements.length === 0) {
      setSubmitError('Add at least one stock movement (or use Quick mark to skip stock).')
      return
    }
    startTransition(async () => {
      const r = await recordDispenseAndStock({
        visitId,
        status,
        notes: notes || undefined,
        movements,
      })
      if (r.success) {
        onClose()
      } else {
        setSubmitError(r.error)
        if ('partialFailures' in r && r.partialFailures) {
          setPartialFailures(r.partialFailures)
        }
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Dispense + decrement stock</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Records the dispense + creates negative stock movements per line.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {medicationsText && (
            <div className="bg-muted/40 rounded-md p-2">
              <div className="kh-meta">PRESCRIBED</div>
              <p className="text-sm whitespace-pre-wrap mt-1">{medicationsText}</p>
            </div>
          )}

          {loadError && <div className="text-sm text-destructive">{loadError}</div>}

          <div className="space-y-2">
            <div className="kh-meta">DEDUCT FROM</div>
            {lines.map((line) => {
              const selected = stockOptions.find((s) => s.id === line.stockItemId)
              return (
                <div key={line.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-start">
                  <select
                    value={line.stockItemId}
                    onChange={(e) => updateLine(line.id, { stockItemId: e.target.value })}
                    className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                  >
                    <option value="">— Select stock item —</option>
                    {stockOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.drug_name}
                        {opt.strength ? ` · ${opt.strength}` : ''}
                        {' · '}
                        {opt.quantity_on_hand} {opt.unit} on hand
                      </option>
                    ))}
                  </select>
                  <div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      placeholder={selected ? `qty in ${selected.unit}` : 'qty'}
                      className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove line"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={addLine}
              className="text-xs text-cobalt hover:underline inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add another item
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="kh-meta">DISPENSE STATUS</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background mt-1"
              >
                <option value="dispensed">Dispensed (fully)</option>
                <option value="partial">Partial</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </div>
            <div>
              <label className="kh-meta">NOTE (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. substituted Cotrim for Amox"
                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background mt-1"
              />
            </div>
          </div>

          {submitError && (
            <div className="text-sm text-destructive bg-destructive/5 rounded-md p-2">
              {submitError}
              {partialFailures.length > 0 && (
                <ul className="list-disc pl-5 mt-1 text-xs">
                  {partialFailures.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-card border border-border text-body rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="bg-green text-white rounded-md px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Record dispense
          </button>
        </div>
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
