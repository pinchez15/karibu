'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import {
  prescriptionLineDisplayName,
  type PrescriptionOrderLine,
} from '@karibu/shared'
import type { CompleteDispenseLine, DispenseLineStatus } from '@/lib/validators/prescription'
import {
  matchStockForPrescription,
  stockItemLabel,
  type PharmacyStockRow,
} from '@/lib/pharmacy-stock-match'
import {
  completePharmacyDispense,
  completeLegacyPharmacyDispense,
  listClinicPharmacyStock,
  sendPharmacyBackToClinician,
  startPharmacyDispense,
} from './actions'
import type { PharmacyStationRow } from './pharmacy-data'
import { patientDisplayName, patientMeta } from './pharmacy-shared'

export type DispenseCompletionResult = {
  dispensingStatus: string
  stockLinesDecremented: number
}

type LineDraft = {
  prescription_order_id: string
  quantity_dispensed: string
  quantity_unit: string
  line_status: DispenseLineStatus
  stock_item_id: string
  stock_quantity: string
  substitute: boolean
  substitute_notes: string
  notes: string
}

function prescribedQtyLabel(line: PrescriptionOrderLine): string | null {
  if (line.quantity_prescribed == null) return null
  const unit = line.quantity_unit?.trim()
  return unit
    ? `${line.quantity_prescribed} ${unit}`
    : String(line.quantity_prescribed)
}

function defaultDraft(line: PrescriptionOrderLine): LineDraft {
  const qty =
    line.quantity_prescribed != null ? String(line.quantity_prescribed) : ''
  return {
    prescription_order_id: line.id,
    quantity_dispensed: qty,
    quantity_unit: line.quantity_unit ?? '',
    line_status: 'dispensed',
    stock_item_id: '',
    stock_quantity: qty,
    substitute: false,
    substitute_notes: '',
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

function autoPickStock(
  line: PrescriptionOrderLine,
  displayName: string,
  stock: PharmacyStockRow[],
): string {
  const matches = matchStockForPrescription(line, displayName, stock)
  return matches[0]?.id ?? ''
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
  onCompleted?: (result: DispenseCompletionResult) => void
  onSentBack?: () => void
  completeFn?: typeof completePharmacyDispense
}) {
  const [stock, setStock] = useState<PharmacyStockRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [visitNotes, setVisitNotes] = useState(row.dispense_notes ?? '')
  const [sendBackReason, setSendBackReason] = useState('')
  const [showSendBack, setShowSendBack] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [started, setStarted] = useState(row.dispensing_status !== 'not_started')
  const lines = row.prescription_lines
  const completeDispense = completeFn ?? completePharmacyDispense
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lines.map(defaultDraft))

  useEffect(() => {
    setDrafts(lines.map(defaultDraft))
    setVisitNotes(row.dispense_notes ?? '')
    setStarted(row.dispensing_status !== 'not_started')
    setSuccessMessage(null)
    setSubmitError(null)
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
      .catch(() =>
        setLoadError(
          'Could not load stock. You can still record dispensing; stock will not be decremented.',
        ),
      )
  }, [])

  useEffect(() => {
    if (stock.length === 0) return
    setDrafts((prev) =>
      prev.map((draft, idx) => {
        const line = lines[idx]
        if (!line || draft.stock_item_id || draft.substitute) return draft
        const name = prescriptionLineDisplayName(line)
        const stockId = autoPickStock(line, name, stock)
        if (!stockId) return draft
        return {
          ...draft,
          stock_item_id: stockId,
          stock_quantity: draft.quantity_dispensed || draft.stock_quantity,
        }
      }),
    )
  }, [stock, lines])

  function updateDraft(id: string, patch: Partial<LineDraft>) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.prescription_order_id !== id) return d
        const next = { ...d, ...patch }
        if (patch.quantity_dispensed !== undefined) {
          next.stock_quantity = patch.quantity_dispensed
        }
        if (patch.substitute === false) {
          const idx = lines.findIndex((l) => l.id === id)
          const line = lines[idx]
          if (line) {
            const name = prescriptionLineDisplayName(line)
            const stockId = autoPickStock(line, name, stock)
            next.stock_item_id = stockId
            next.substitute_notes = ''
          }
        }
        if (patch.substitute === true) {
          next.stock_item_id = ''
        }
        return next
      }),
    )
  }

  function stockOptionsForLine(line: PrescriptionOrderLine, draft: LineDraft): PharmacyStockRow[] {
    if (draft.substitute) return stock
    const name = prescriptionLineDisplayName(line)
    return matchStockForPrescription(line, name, stock)
  }

  function validatePayload(): string | null {
    for (let idx = 0; idx < drafts.length; idx++) {
      const draft = drafts[idx]
      const line = lines[idx]
      const name = prescriptionLineDisplayName(line)

      if (draft.line_status === 'out_of_stock') continue

      if (!draft.quantity_dispensed.trim()) {
        return `Enter quantity dispensed for ${name}.`
      }

      const qty = parseFloat(draft.quantity_dispensed)
      if (!Number.isFinite(qty) || qty <= 0) {
        return `Quantity dispensed for ${name} must be greater than zero.`
      }

      if (!draft.quantity_unit.trim()) {
        return `Enter unit for ${name} (e.g. tabs, caps).`
      }

      const options = stockOptionsForLine(line, draft)
      if (options.length > 0 && !draft.stock_item_id) {
        return `Select stock for ${name} or mark as out of stock.`
      }

      if (draft.stock_item_id) {
        const selected = stock.find((s) => s.id === draft.stock_item_id)
        const stockQty = parseFloat(draft.stock_quantity || draft.quantity_dispensed)
        if (selected && stockQty > selected.quantity_on_hand) {
          return `Not enough ${selected.drug_name} in stock (${selected.quantity_on_hand} ${selected.unit} on hand).`
        }
      }
    }
    return null
  }

  function buildPayload(): CompleteDispenseLine[] {
    return drafts.map((draft, idx) => {
      const line = lines[idx]
      const qty = parseFloat(draft.quantity_dispensed)
      const stockQty = draft.stock_quantity.trim()
        ? parseFloat(draft.stock_quantity)
        : qty
      const stockId = draft.stock_item_id || null
      const selected = stockId ? stock.find((s) => s.id === stockId) : undefined
      const prescribedCode = line.medication_code?.toUpperCase()
      const substituteCode =
        draft.substitute && selected && selected.drug_code.toUpperCase() !== prescribedCode
          ? selected.drug_code
          : null

      return {
        prescription_order_id: draft.prescription_order_id,
        line_status: draft.line_status,
        quantity_dispensed: qty,
        quantity_unit: draft.quantity_unit.trim() || line.quantity_unit,
        stock_item_id: stockId,
        stock_quantity: stockId && stockQty > 0 ? stockQty : null,
        substitute_medication_code: substituteCode,
        notes:
          [draft.substitute_notes.trim(), draft.notes.trim()].filter(Boolean).join(' — ') || null,
      }
    })
  }

  function completionMessage(
    status: string,
    stockLinesDecremented: number,
  ): string {
    const stockNote =
      stockLinesDecremented > 0
        ? ` Stock updated for ${stockLinesDecremented} item${stockLinesDecremented === 1 ? '' : 's'}.`
        : ' No stock was decremented — check stock selection or quantity.'

    if (status === 'dispensed') {
      return `Dispensing complete.${stockNote} This visit is in Done today.`
    }
    if (status === 'partial') {
      return `Partially dispensed.${stockNote} Finish remaining items in In progress.`
    }
    if (status === 'out_of_stock') {
      return `Marked out of stock.${stockNote} Visit moved to Done today.`
    }
    return `Saved.${stockNote}`
  }

  function handleStart() {
    setSubmitError(null)
    setSuccessMessage(null)
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
    setSuccessMessage(null)

    const validationError = validatePayload()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    startTransition(async () => {
      if (lines.length === 0) {
        const r = await completeLegacyPharmacyDispense({
          visitId: row.id,
          notes: visitNotes.trim() || undefined,
        })
        if (!r.success) {
          setSubmitError(r.error)
          return
        }
        setSuccessMessage('Marked dispensed. Visit is in Done today.')
        onCompleted?.({ dispensingStatus: 'dispensed', stockLinesDecremented: 0 })
        return
      }

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

      const payload = buildPayload()
      const stockLinesDecremented = payload.filter(
        (line) => line.stock_item_id && line.stock_quantity && line.stock_quantity > 0,
      ).length

      const r = await completeDispense({
        visitId: row.id,
        lines: payload,
        notes: visitNotes.trim() || undefined,
      })
      if (!r.success) {
        setSubmitError(r.error)
        return
      }

      const message = completionMessage(r.dispensingStatus, stockLinesDecremented)
      setSuccessMessage(message)
      onCompleted?.({
        dispensingStatus: r.dispensingStatus,
        stockLinesDecremented,
      })
    })
  }

  function handleSendBack() {
    setSubmitError(null)
    setSuccessMessage(null)
    startTransition(async () => {
      const r = await sendPharmacyBackToClinician(row.id, sendBackReason)
      if (!r.success) {
        setSubmitError(r.error)
        return
      }
      onSentBack?.()
    })
  }

  const terminalVisit = ['dispensed', 'out_of_stock'].includes(row.dispensing_status)

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
          <p className="mb-3 text-sm text-amber-ink">{loadError}</p>
        )}

        {lines.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              No structured prescription lines on this visit. Dispense from the clinician&apos;s
              medication list below, then mark complete.
            </p>
            {row.medications?.trim() ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-line-soft bg-background p-3 font-sans text-body">
                {row.medications.trim()}
              </pre>
            ) : (
              <p className="text-muted-foreground">No medications listed on this visit.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {lines.map((line, idx) => {
              const draft = drafts[idx]
              const name = prescriptionLineDisplayName(line)
              const sig = lineSig(line)
              const prescribed = prescribedQtyLabel(line)
              const stockOptions = draft ? stockOptionsForLine(line, draft) : []
              const selectedStock = draft?.stock_item_id
                ? stock.find((s) => s.id === draft.stock_item_id)
                : undefined

              return (
                <div
                  key={line.id}
                  className="rounded-lg border border-line-soft bg-card p-3"
                  data-testid={`rx-line-${line.id}`}
                >
                  <div className="mb-3">
                    <p className="font-medium text-foreground">{name}</p>
                    {sig && <p className="mt-0.5 text-xs text-muted-foreground">{sig}</p>}
                    <p className="mt-2 text-sm">
                      <span className="font-medium text-foreground">Prescribed: </span>
                      <span className="text-body">
                        {prescribed ?? 'Quantity not on script — confirm with clinician'}
                      </span>
                    </p>
                  </div>

                  {!readOnly && draft && (
                    <div className="space-y-3 border-t border-line-soft pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Confirm dispensing
                      </p>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="block text-xs">
                          <span className="mb-1 block text-muted-foreground">Qty dispensing</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                            value={draft.quantity_dispensed}
                            onChange={(e) =>
                              updateDraft(line.id, { quantity_dispensed: e.target.value })
                            }
                            disabled={pending}
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="mb-1 block text-muted-foreground">Unit</span>
                          <input
                            className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                            value={draft.quantity_unit}
                            onChange={(e) =>
                              updateDraft(line.id, { quantity_unit: e.target.value })
                            }
                            disabled={pending}
                            placeholder="tabs"
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="mb-1 block text-muted-foreground">Outcome</span>
                          <select
                            className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                            value={draft.line_status}
                            onChange={(e) =>
                              updateDraft(line.id, {
                                line_status: e.target.value as DispenseLineStatus,
                              })
                            }
                            disabled={pending}
                          >
                            <option value="dispensed">Dispensed</option>
                            <option value="partially_dispensed">Partial</option>
                            <option value="out_of_stock">Out of stock</option>
                          </select>
                        </label>
                      </div>

                      {draft.line_status !== 'out_of_stock' && (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={draft.substitute}
                              onChange={(e) =>
                                updateDraft(line.id, { substitute: e.target.checked })
                              }
                              disabled={pending}
                            />
                            <span>Substitute a different medication or strength</span>
                          </label>

                          {draft.substitute && (
                            <label className="block text-xs">
                              <span className="mb-1 block text-muted-foreground">
                                Substitution note
                              </span>
                              <input
                                className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                                value={draft.substitute_notes}
                                onChange={(e) =>
                                  updateDraft(line.id, { substitute_notes: e.target.value })
                                }
                                disabled={pending}
                                placeholder="e.g. 40 × 150 mg tabs instead of 20 × 250 mg"
                              />
                            </label>
                          )}

                          <label className="block text-xs">
                            <span className="mb-1 block text-muted-foreground">
                              {draft.substitute ? 'Substitute from stock' : 'From stock'}
                            </span>
                            {stockOptions.length === 0 && !draft.substitute ? (
                              <p className="rounded-md border border-dashed border-line-soft px-2 py-2 text-sm text-muted-foreground">
                                No matching stock on shelf. Enable substitution or mark out of stock.
                              </p>
                            ) : (
                              <select
                                className="w-full rounded-md border border-line-soft px-2 py-1.5 text-sm"
                                value={draft.stock_item_id}
                                onChange={(e) =>
                                  updateDraft(line.id, { stock_item_id: e.target.value })
                                }
                                disabled={pending}
                              >
                                <option value="">— Select —</option>
                                {(draft.substitute ? stock : stockOptions).map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {stockItemLabel(s)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </label>

                          {selectedStock && (
                            <p className="text-xs text-muted-foreground">
                              Will decrement {draft.stock_quantity || draft.quantity_dispensed || '—'}{' '}
                              {selectedStock.unit} from {selectedStock.drug_name} (
                              {selectedStock.quantity_on_hand} on hand).
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {readOnly && line.status !== 'ordered' && (
                    <p className="text-sm capitalize text-muted-foreground">
                      Line: {line.status.replace('_', ' ')}
                    </p>
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

        {successMessage && (
          <p className="mt-3 rounded-md bg-green-soft px-3 py-2 text-sm text-green" role="status">
            {successMessage}
          </p>
        )}

        {submitError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}
      </div>

      {!readOnly && !terminalVisit && (
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-line-soft px-5 py-3">
          {!started && lines.length > 0 && (
            <button
              type="button"
              className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium"
              onClick={handleStart}
              disabled={pending}
            >
              Start dispensing
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-cobalt px-4 py-2 text-sm font-medium text-white"
            onClick={handleComplete}
            disabled={pending}
            data-testid="save-complete"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {lines.length === 0 ? 'Mark dispensed' : 'Dispense & complete'}
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
