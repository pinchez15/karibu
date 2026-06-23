'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import {
  prescriptionLineDisplayName,
  type PrescriptionOrderLine,
} from '@karibu/shared'
import type { CompleteDispenseLine, DispenseLineStatus } from '@/lib/validators/prescription'
import {
  completePharmacyDispense,
  listClinicPharmacyStock,
  sendPharmacyBackToClinician,
  startPharmacyDispense,
} from './actions'
import type { PharmacyStationRow, PharmacyStockItem } from './pharmacy-data'
import { patientDisplayName, patientMeta } from './pharmacy-shared'

type StockOption = PharmacyStockItem

type LineDraft = {
  prescription_order_id: string
  quantity_dispensed: string
  quantity_unit: string
  line_status: DispenseLineStatus
  stock_item_id: string
  stock_quantity: string
  notes: string
}

function defaultDraft(line: PrescriptionOrderLine): LineDraft {
  return {
    prescription_order_id: line.id,
    quantity_dispensed:
      line.quantity_prescribed != null ? String(line.quantity_prescribed) : '',
    quantity_unit: line.quantity_unit ?? '',
    line_status: 'dispensed',
    stock_item_id: '',
    stock_quantity: '',
    notes: '',
  }
}

function lineSig(line: PrescriptionOrderLine): string {
  const parts = [
    line.dose_text,
    line.route_text,
    line.frequency_text,
    line.duration_text,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function PrescriptionWorksheet({
  row,
  readOnly = false,
  onCompleted,
  onSentBack,
  completeFn,
}: {
  row: PharmacyStationRow
  readOnly?: boolean
  onCompleted?: () => void
  onSentBack?: () => void
  /** E2E / test injection */
  completeFn?: typeof completePharmacyDispense
}) {
  const [stock, setStock] = useState<StockOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [visitNotes, setVisitNotes] = useState(row.dispense_notes ?? '')
  const [sendBackReason, setSendBackReason] = useState('')
  const [showSendBack, setShowSendBack] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [started, setStarted] = useState(row.dispensing_status !== 'not_started')
  const lines = row.prescription_lines
  const completeDispense = completeFn ?? completePharmacyDispense
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lines.map(defaultDraft))

  useEffect(() => {
    setDrafts(lines.map(defaultDraft))
    setVisitNotes(row.dispense_notes ?? '')
    setStarted(row.dispensing_status !== 'not_started')
  }, [row.id, row.dispense_notes, row.dispensing_status, lines])

  useEffect(() => {
    listClinicPharmacyStock()
      .then((result) => {
        if (result.ok) {
          setStock(result.items)
          setLoadError(null)
        } else {
          setLoadError(result.error)
        }
      })
      .catch(() => setLoadError('Could not load the stock list. You can still dispense; stock decrement is unavailable.'))
  }, [])

  const stockByCode = useMemo(() => {
    const map = new Map<string, StockOption[]>()
    for (const item of stock) {
      const key = item.drug_code.toUpperCase()
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [stock])

  function updateDraft(id: string, patch: Partial<LineDraft>) {
    setDrafts((prev) => prev.map((d) => (d.prescription_order_id === id ? { ...d, ...patch } : d)))
  }

  function suggestStockItem(line: PrescriptionOrderLine, draft: LineDraft): string {
    if (draft.stock_item_id) return draft.stock_item_id
    const code = line.medication_code?.toUpperCase()
    if (!code) return ''
    const matches = stockByCode.get(code) ?? []
    return matches[0]?.id ?? ''
  }

  function buildPayload(): CompleteDispenseLine[] {
    return drafts.map((draft, idx) => {
      const line = lines[idx]
      const qty = draft.quantity_dispensed.trim()
        ? parseFloat(draft.quantity_dispensed)
        : null
      const stockQty = draft.stock_quantity.trim()
        ? parseFloat(draft.stock_quantity)
        : qty
      const stockId = draft.stock_item_id || suggestStockItem(line, draft)
      return {
        prescription_order_id: draft.prescription_order_id,
        line_status: draft.line_status,
        quantity_dispensed: qty,
        quantity_unit: draft.quantity_unit.trim() || line.quantity_unit,
        stock_item_id: stockId || null,
        stock_quantity: stockId && stockQty && stockQty > 0 ? stockQty : null,
        notes: draft.notes.trim() || null,
      }
    })
  }

  function handleStart() {
    setSubmitError(null)
    startTransition(async () => {
      const r = await startPharmacyDispense(row.id)
      if (!r.success) {
        setSubmitError(r.error)
        return
      }
      setStarted(true)
    })
  }

  function handleComplete() {
    setSubmitError(null)
    startTransition(async () => {
      if (!started) {
        if (completeFn) {
          setStarted(true)
        } else {
          const start = await startPharmacyDispense(row.id)
          if (!start.success) {
            setSubmitError(start.error)
            return
          }
          setStarted(true)
        }
      }
      const r = await completeDispense({
        visitId: row.id,
        lines: buildPayload(),
        notes: visitNotes.trim() || undefined,
      })
      if (!r.success) {
        setSubmitError(r.error)
        return
      }
      onCompleted?.()
    })
  }

  function handleSendBack() {
    setSubmitError(null)
    startTransition(async () => {
      const r = await sendPharmacyBackToClinician(row.id, sendBackReason)
      if (!r.success) {
        setSubmitError(r.error)
        return
      }
      onSentBack?.()
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pharmacy-detail-pane">
      <header className="shrink-0 border-b border-line-soft px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prescriptions
        </p>
        <h2 className="text-lg font-semibold text-foreground">{patientDisplayName(row)}</h2>
        <p className="text-sm text-muted-foreground">{patientMeta(row)}</p>
        {row.diagnosis && (
          <p className="mt-1 text-sm text-body">
            <span className="font-medium">Dx:</span> {row.diagnosis}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loadError && (
          <p className="mb-3 text-sm text-amber-ink">Stock list unavailable: {loadError}</p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No structured prescription lines on this visit. Ask the clinician to resubmit from the
            medication composer.
          </p>
        ) : (
          <div className="space-y-4">
            {lines.map((line, idx) => {
              const draft = drafts[idx]
              const name = prescriptionLineDisplayName(line)
              const sig = lineSig(line)
              return (
                <div
                  key={line.id}
                  className="rounded-lg border border-line-soft bg-card p-3"
                  data-testid={`rx-line-${line.id}`}
                >
                  {/* Compact per-med row so the tech doesn't scroll to find all
                      meds + the dispense controls (note #13). */}
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium text-foreground">{name}</p>
                    {line.quantity_prescribed != null && (
                      <p className="text-xs text-muted-foreground">
                        Rx: {line.quantity_prescribed} {line.quantity_unit ?? ''}
                      </p>
                    )}
                    {sig && <p className="w-full text-xs text-muted-foreground">{sig}</p>}
                  </div>

                  {!readOnly && draft && (
                    <div className="grid gap-2 sm:grid-cols-[140px_84px_72px_minmax(0,1fr)] sm:items-end">
                      <label className="block text-xs">
                        <span className="mb-1 block text-muted-foreground">Status</span>
                        <select
                          className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                          value={draft.line_status}
                          onChange={(e) =>
                            updateDraft(line.id, { line_status: e.target.value as DispenseLineStatus })
                          }
                          disabled={pending}
                        >
                          <option value="dispensed">Dispensed</option>
                          <option value="partially_dispensed">Partial</option>
                          <option value="out_of_stock">Out of stock</option>
                        </select>
                      </label>
                      <label className="block text-xs">
                        <span className="mb-1 block text-muted-foreground">Qty</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                          value={draft.quantity_dispensed}
                          onChange={(e) => updateDraft(line.id, { quantity_dispensed: e.target.value })}
                          disabled={pending}
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="mb-1 block text-muted-foreground">Unit</span>
                        <input
                          className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                          value={draft.quantity_unit}
                          onChange={(e) => updateDraft(line.id, { quantity_unit: e.target.value })}
                          disabled={pending}
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="mb-1 block text-muted-foreground">Stock (decrements)</span>
                        <select
                          className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                          value={draft.stock_item_id || suggestStockItem(line, draft)}
                          onChange={(e) =>
                            updateDraft(line.id, {
                              stock_item_id: e.target.value,
                              stock_quantity: draft.quantity_dispensed,
                            })
                          }
                          disabled={pending}
                        >
                          <option value="">— Skip —</option>
                          {stock.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.drug_name} {s.strength ?? ''} ({s.quantity_on_hand} {s.unit})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {readOnly && line.status !== 'ordered' && (
                    <p className="text-sm capitalize text-muted-foreground">Line: {line.status.replace('_', ' ')}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-foreground">Counselling / visit notes</span>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-line-soft px-3 py-2 text-sm"
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.target.value)}
            disabled={pending || readOnly}
            placeholder="Counselled to finish antibiotics…"
          />
        </label>

        {showSendBack && !readOnly && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-foreground">Reason for send-back</span>
            <textarea
              className="min-h-[56px] w-full rounded-md border border-line-soft px-3 py-2 text-sm"
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              disabled={pending}
              placeholder="Dose unclear — confirm duration with clinician"
            />
          </label>
        )}

        {submitError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}
      </div>

      {!readOnly && (
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-line-soft px-5 py-3">
          {!started && (
            <button
              type="button"
              className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium"
              onClick={handleStart}
              disabled={pending || lines.length === 0}
            >
              Start dispense
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-cobalt px-4 py-2 text-sm font-medium text-white"
            onClick={handleComplete}
            disabled={pending || lines.length === 0}
            data-testid="save-complete"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Hand over &amp; complete
          </button>
          <button
            type="button"
            className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium"
            onClick={() => {
              if (showSendBack && sendBackReason.trim()) {
                handleSendBack()
              } else {
                setShowSendBack(true)
              }
            }}
            disabled={pending}
            data-testid="send-back"
          >
            {showSendBack ? 'Confirm send back' : 'Send back to clinician'}
          </button>
        </footer>
      )}
    </div>
  )
}
