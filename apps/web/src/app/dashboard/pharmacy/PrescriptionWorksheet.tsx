'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
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
  completeLegacyPharmacyDispense,
  dispensePharmacyLine,
  listClinicPharmacyStock,
  sendPharmacyLineBackToClinician,
  startPharmacyDispense,
} from './actions'
import type { PharmacyStationRow } from './pharmacy-data'
import { patientDisplayName, patientMeta } from './pharmacy-shared'
import { cn } from '@/lib/utils'

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
}

const field =
  'h-7 rounded border border-line-soft bg-background px-1.5 text-xs text-foreground disabled:opacity-60'

function prescribedShort(line: PrescriptionOrderLine): string {
  if (line.quantity_prescribed == null) return '—'
  const unit = line.quantity_unit?.trim()
  return unit ? `${line.quantity_prescribed} ${unit}` : String(line.quantity_prescribed)
}

function defaultDraft(line: PrescriptionOrderLine): LineDraft {
  const qty = line.quantity_prescribed != null ? String(line.quantity_prescribed) : ''
  return {
    prescription_order_id: line.id,
    quantity_dispensed: qty,
    quantity_unit: line.quantity_unit ?? '',
    line_status: 'dispensed',
    stock_item_id: '',
    stock_quantity: qty,
    substitute: false,
    substitute_notes: '',
  }
}

function lineIsEditable(status: string): boolean {
  return ['ordered', 'dispensing', 'partially_dispensed'].includes(status)
}

function lineOutcomeLabel(status: string): string {
  switch (status) {
    case 'dispensed':
      return 'Dispensed'
    case 'partially_dispensed':
      return 'Partial'
    case 'out_of_stock':
      return 'Out of stock'
    case 'needs_clarification':
      return 'Sent to clinician'
    default:
      return status.replace(/_/g, ' ')
  }
}

function autoPickStock(
  line: PrescriptionOrderLine,
  displayName: string,
  stock: PharmacyStockRow[],
): string {
  return matchStockForPrescription(line, displayName, stock)[0]?.id ?? ''
}

export function PrescriptionWorksheet({
  row,
  readOnly = false,
  onCompleted,
  onUpdated,
  dispenseLineFn,
}: {
  row: PharmacyStationRow
  readOnly?: boolean
  onCompleted?: (result: DispenseCompletionResult) => void
  onUpdated?: () => void
  dispenseLineFn?: typeof dispensePharmacyLine
}) {
  const [stock, setStock] = useState<PharmacyStockRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [visitNotes, setVisitNotes] = useState(row.dispense_notes ?? '')
  const [lineError, setLineError] = useState<string | null>(null)
  const [lineMessage, setLineMessage] = useState<string | null>(null)
  const [busyLineId, setBusyLineId] = useState<string | null>(null)
  const [sendBackLineId, setSendBackLineId] = useState<string | null>(null)
  const [sendBackReason, setSendBackReason] = useState('')
  const [pending, startTransition] = useTransition()
  const lines = row.prescription_lines
  const dispenseLine = dispenseLineFn ?? dispensePharmacyLine
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(lines.filter((l) => lineIsEditable(l.status)).map((l) => [l.id, defaultDraft(l)])),
  )

  const firstEditableLineId = useMemo(
    () => lines.find((l) => lineIsEditable(l.status))?.id ?? null,
    [lines],
  )

  const pendingCount = useMemo(
    () => lines.filter((l) => lineIsEditable(l.status)).length,
    [lines],
  )

  useEffect(() => {
    setVisitNotes(row.dispense_notes ?? '')
    setLineError(null)
    setLineMessage(null)
    setSendBackLineId(null)
    setSendBackReason('')
    setDrafts(
      Object.fromEntries(
        lines.filter((l) => lineIsEditable(l.status)).map((l) => [l.id, defaultDraft(l)]),
      ),
    )
  }, [row.id, row.dispense_notes, lines])

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
        setLoadError('Could not load stock. Dispensing will not decrement inventory.'),
      )
  }, [])

  useEffect(() => {
    if (stock.length === 0) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const line of lines) {
        if (!lineIsEditable(line.status)) continue
        const draft = next[line.id]
        if (!draft || draft.stock_item_id || draft.substitute) continue
        const stockId = autoPickStock(line, prescriptionLineDisplayName(line), stock)
        if (!stockId) continue
        next[line.id] = {
          ...draft,
          stock_item_id: stockId,
          stock_quantity: draft.quantity_dispensed || draft.stock_quantity,
        }
      }
      return next
    })
  }, [stock, lines])

  function updateDraft(id: string, patch: Partial<LineDraft>) {
    setDrafts((prev) => {
      const current = prev[id]
      if (!current) return prev
      const next = { ...current, ...patch }
      if (patch.quantity_dispensed !== undefined) {
        next.stock_quantity = patch.quantity_dispensed
      }
      if (patch.substitute === false) {
        const line = lines.find((l) => l.id === id)
        if (line) {
          next.stock_item_id = autoPickStock(line, prescriptionLineDisplayName(line), stock)
          next.substitute_notes = ''
        }
      }
      if (patch.substitute === true) {
        next.stock_item_id = ''
      }
      return { ...prev, [id]: next }
    })
  }

  function stockOptionsForLine(line: PrescriptionOrderLine, draft: LineDraft): PharmacyStockRow[] {
    if (draft.substitute) return stock
    return matchStockForPrescription(line, prescriptionLineDisplayName(line), stock)
  }

  function validateDraft(line: PrescriptionOrderLine, draft: LineDraft): string | null {
    const name = prescriptionLineDisplayName(line)
    if (draft.line_status === 'out_of_stock') return null

    if (!draft.quantity_dispensed.trim()) return `Enter qty for ${name}.`
    const qty = parseFloat(draft.quantity_dispensed)
    if (!Number.isFinite(qty) || qty <= 0) return `Qty for ${name} must be > 0.`
    if (!draft.quantity_unit.trim()) return `Enter unit for ${name}.`

    const options = stockOptionsForLine(line, draft)
    if (options.length > 0 && !draft.stock_item_id) {
      return `Select stock for ${name} or mark out of stock.`
    }

    const selected = draft.stock_item_id ? stock.find((s) => s.id === draft.stock_item_id) : undefined
    const stockQty = parseFloat(draft.stock_quantity || draft.quantity_dispensed)
    if (selected && stockQty > selected.quantity_on_hand) {
      return `Not enough ${selected.drug_name} on shelf.`
    }
    return null
  }

  function buildLinePayload(line: PrescriptionOrderLine, draft: LineDraft): CompleteDispenseLine {
    const qty = parseFloat(draft.quantity_dispensed)
    const stockQty = draft.stock_quantity.trim() ? parseFloat(draft.stock_quantity) : qty
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
      notes: draft.substitute_notes.trim() || null,
    }
  }

  function handleDispenseLine(line: PrescriptionOrderLine) {
    const draft = drafts[line.id]
    if (!draft) return

    const validationError = validateDraft(line, draft)
    if (validationError) {
      setLineError(validationError)
      setLineMessage(null)
      return
    }

    setLineError(null)
    setLineMessage(null)
    setBusyLineId(line.id)

    startTransition(async () => {
      if (row.dispensing_status === 'not_started') {
        const start = await startPharmacyDispense(row.id)
        if (!start.success) {
          setLineError(start.error)
          setBusyLineId(null)
          return
        }
      }

      const payload = buildLinePayload(line, draft)
      const r = await dispenseLine({
        visitId: row.id,
        line: payload,
        notes: visitNotes.trim() || undefined,
      })

      setBusyLineId(null)

      if (!r.success) {
        setLineError(r.error)
        return
      }

      const stockDecremented =
        payload.stock_item_id && payload.stock_quantity && payload.stock_quantity > 0 ? 1 : 0

      const name = prescriptionLineDisplayName(line)
      setLineMessage(`${name} — ${lineOutcomeLabel(draft.line_status)}.`)

      const result = { dispensingStatus: r.dispensingStatus, stockLinesDecremented: stockDecremented }
      if (['dispensed', 'out_of_stock'].includes(r.dispensingStatus)) {
        onCompleted?.(result)
      } else {
        onUpdated?.()
        onCompleted?.(result)
      }
    })
  }

  function handleSendBackLine(line: PrescriptionOrderLine) {
    if (!sendBackReason.trim()) {
      setLineError('Enter a reason before sending back.')
      return
    }

    setLineError(null)
    setBusyLineId(line.id)

    startTransition(async () => {
      const r = await sendPharmacyLineBackToClinician(row.id, line.id, sendBackReason)
      setBusyLineId(null)

      if (!r.success) {
        setLineError(r.error)
        return
      }

      setSendBackLineId(null)
      setSendBackReason('')
      setLineMessage(`${prescriptionLineDisplayName(line)} sent to clinician for amendment.`)
      onUpdated?.()
    })
  }

  function handleLegacyComplete() {
    setLineError(null)
    startTransition(async () => {
      const r = await completeLegacyPharmacyDispense({
        visitId: row.id,
        notes: visitNotes.trim() || undefined,
      })
      if (!r.success) {
        setLineError(r.error)
        return
      }
      onCompleted?.({ dispensingStatus: 'dispensed', stockLinesDecremented: 0 })
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pharmacy-detail-pane">
      <header className="shrink-0 border-b border-line-soft px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{patientDisplayName(row)}</h2>
        <p className="text-xs text-muted-foreground">
          {patientMeta(row)}
          {row.diagnosis ? ` · Dx: ${row.diagnosis}` : ''}
        </p>
        {pendingCount > 0 && !readOnly && (
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingCount} script{pendingCount === 1 ? '' : 's'} remaining — dispense each line
            separately.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loadError && <p className="mb-2 text-xs text-amber-ink">{loadError}</p>}

        {lines.length === 0 ? (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Free-text prescription only. Mark complete when dispensed.
            </p>
            {row.medications?.trim() ? (
              <pre className="whitespace-pre-wrap rounded border border-line-soft bg-background p-2 text-xs">
                {row.medications.trim()}
              </pre>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line-soft">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-line-soft bg-muted/50 text-left kh-meta">
                  <th className="px-2 py-1.5 font-medium">Medication</th>
                  <th className="w-14 px-1 py-1.5 font-medium">Rx</th>
                  <th className="w-12 px-1 py-1.5 font-medium">Qty</th>
                  <th className="w-14 px-1 py-1.5 font-medium">Unit</th>
                  <th className="min-w-[140px] px-1 py-1.5 font-medium">Stock</th>
                  <th className="w-[88px] px-1 py-1.5 font-medium">Outcome</th>
                  <th className="w-[108px] px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const draft = drafts[line.id]
                  const editable = !readOnly && lineIsEditable(line.status) && draft
                  const name = prescriptionLineDisplayName(line)
                  const busy = pending && busyLineId === line.id
                  const showSendBack = sendBackLineId === line.id

                  if (!editable) {
                    return (
                      <tr
                        key={line.id}
                        className="border-b border-line-soft/70 bg-muted/20"
                        data-testid={`rx-line-${line.id}`}
                      >
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {line.status === 'dispensed' ? (
                              <Check className="h-3.5 w-3.5 text-green" aria-hidden />
                            ) : line.status === 'needs_clarification' ? (
                              <RotateCcw className="h-3.5 w-3.5 text-amber-ink" aria-hidden />
                            ) : null}
                            <span className="truncate">{name}</span>
                          </span>
                        </td>
                        <td className="px-1 py-1.5 text-muted-foreground">{prescribedShort(line)}</td>
                        <td className="px-1 py-1.5 text-muted-foreground" colSpan={3}>
                          {lineOutcomeLabel(line.status)}
                        </td>
                        <td className="px-2 py-1.5" />
                      </tr>
                    )
                  }

                  const stockOptions = stockOptionsForLine(line, draft)
                  const stockList = draft.substitute ? stock : stockOptions

                  return (
                    <Fragment key={line.id}>
                      <tr
                        className={cn(
                          'border-b border-line-soft/70',
                          index % 2 === 0 ? 'bg-card' : 'bg-background',
                        )}
                        data-testid={`rx-line-${line.id}`}
                      >
                        <td className="max-w-[180px] truncate px-2 py-1 font-medium" title={name}>
                          {name}
                        </td>
                        <td className="px-1 py-1 text-muted-foreground">{prescribedShort(line)}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={cn(field, 'w-12')}
                            value={draft.quantity_dispensed}
                            onChange={(e) =>
                              updateDraft(line.id, { quantity_dispensed: e.target.value })
                            }
                            disabled={busy}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            className={cn(field, 'w-14')}
                            value={draft.quantity_unit}
                            onChange={(e) => updateDraft(line.id, { quantity_unit: e.target.value })}
                            disabled={busy}
                            placeholder="tabs"
                          />
                        </td>
                        <td className="px-1 py-1">
                          {draft.line_status === 'out_of_stock' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : stockList.length === 0 ? (
                            <span className="text-muted-foreground">No match</span>
                          ) : (
                            <select
                              className={cn(field, 'max-w-[160px]')}
                              value={draft.stock_item_id}
                              onChange={(e) =>
                                updateDraft(line.id, { stock_item_id: e.target.value })
                              }
                              disabled={busy}
                            >
                              <option value="">—</option>
                              {stockList.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {stockItemLabel(s)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <select
                            className={cn(field, 'w-[84px]')}
                            value={draft.line_status}
                            onChange={(e) =>
                              updateDraft(line.id, {
                                line_status: e.target.value as DispenseLineStatus,
                              })
                            }
                            disabled={busy}
                          >
                            <option value="dispensed">OK</option>
                            <option value="partially_dispensed">Part</option>
                            <option value="out_of_stock">OOS</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="inline-flex h-7 items-center rounded bg-cobalt px-2 text-[11px] font-medium text-white disabled:opacity-60"
                              onClick={() => handleDispenseLine(line)}
                              disabled={busy}
                              data-testid={
                                line.id === firstEditableLineId ? 'save-complete' : undefined
                              }
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Dispense'}
                            </button>
                            <button
                              type="button"
                              className="h-7 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setSendBackLineId(showSendBack ? null : line.id)
                                setSendBackReason('')
                              }}
                              disabled={busy}
                              title="Send this script back to clinician"
                            >
                              ↩
                            </button>
                          </div>
                        </td>
                      </tr>
                      {(draft.substitute || showSendBack) && (
                        <tr key={`${line.id}-extra`} className="border-b border-line-soft/70 bg-muted/30">
                          <td colSpan={7} className="px-2 py-1.5">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="inline-flex items-center gap-1.5 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={draft.substitute}
                                  onChange={(e) =>
                                    updateDraft(line.id, { substitute: e.target.checked })
                                  }
                                  disabled={busy}
                                />
                                Substitute
                              </label>
                              {draft.substitute && (
                                <input
                                  className={cn(field, 'min-w-[200px] flex-1')}
                                  value={draft.substitute_notes}
                                  onChange={(e) =>
                                    updateDraft(line.id, { substitute_notes: e.target.value })
                                  }
                                  disabled={busy}
                                  placeholder="Substitution note"
                                />
                              )}
                              {showSendBack && (
                                <>
                                  <input
                                    className={cn(field, 'min-w-[200px] flex-1')}
                                    value={sendBackReason}
                                    onChange={(e) => setSendBackReason(e.target.value)}
                                    disabled={busy}
                                    placeholder="Reason for send-back"
                                  />
                                  <button
                                    type="button"
                                    className="h-7 rounded border border-line-soft px-2 text-[11px] font-medium"
                                    onClick={() => handleSendBackLine(line)}
                                    disabled={busy}
                                  >
                                    Confirm send-back
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <label className="mt-3 block text-xs">
          <span className="mb-1 block font-medium text-foreground">Counselling notes</span>
          <textarea
            className="min-h-[48px] w-full rounded-md border border-line-soft px-2 py-1.5 text-xs"
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.target.value)}
            disabled={pending || readOnly}
            placeholder="Counselled to finish antibiotics…"
          />
        </label>

        {lineMessage && (
          <p className="mt-2 rounded bg-green-soft px-2 py-1.5 text-xs text-green" role="status">
            {lineMessage}
          </p>
        )}
        {lineError && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {lineError}
          </p>
        )}
      </div>

      {!readOnly && lines.length === 0 && (
        <footer className="shrink-0 border-t border-line-soft px-4 py-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md bg-cobalt px-3 text-xs font-medium text-white"
            onClick={handleLegacyComplete}
            disabled={pending}
            data-testid="save-complete"
          >
            Mark dispensed
          </button>
        </footer>
      )}
    </div>
  )
}
