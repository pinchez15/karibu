'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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

/** Quantity already recorded across prior dispense records for this line. */
function alreadyDispensed(line: PrescriptionOrderLine): number {
  const n = line.quantity_dispensed_so_far
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * WP3 D2: a re-opened partial line must default to the REMAINING quantity, not
 * the full prescribed amount — otherwise re-dispensing double-bills (the DB sums
 * dispense records incrementally). Returns null when no quantity was prescribed.
 */
function remainingToDispense(line: PrescriptionOrderLine): number | null {
  if (line.quantity_prescribed == null) return null
  return Math.max(0, line.quantity_prescribed - alreadyDispensed(line))
}

function defaultDraft(line: PrescriptionOrderLine): LineDraft {
  const remaining = remainingToDispense(line)
  const qty = remaining != null ? String(remaining) : ''
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
  startDispenseFn,
}: {
  row: PharmacyStationRow
  readOnly?: boolean
  onCompleted?: (result: DispenseCompletionResult) => void
  onUpdated?: () => void
  dispenseLineFn?: typeof dispensePharmacyLine
  startDispenseFn?: typeof startPharmacyDispense
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
  const startDispense = startDispenseFn ?? startPharmacyDispense
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
        const start = await startDispense(row.id)
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

      // onCompleted decides whether the visit leaves the queue (only when fully
      // dispensed — WP1 D2) or stays and refreshes. A single call avoids a
      // double refetch for the partial / out-of-stock case.
      const result = { dispensingStatus: r.dispensingStatus, stockLinesDecremented: stockDecremented }
      onCompleted?.(result)
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
        {loadError && (
          // WP1 D5: a swallowed stock-list failure used to let the worksheet
          // dispense silently without decrementing stock. Surface it loudly and
          // persistently so the pharmacist knows counts won't move.
          <div
            className="mb-3 rounded-md border border-amber-ink/30 bg-amber-soft px-3 py-2 text-xs text-amber-ink"
            role="alert"
            data-testid="stock-unavailable-banner"
          >
            <span className="font-semibold">Stock list unavailable</span> — dispensing
            will not reduce stock counts.
          </div>
        )}

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
          <div className="space-y-2 rounded-lg border border-line-soft p-2" data-testid="rx-worksheet">
            {lines.map((line, index) => {
              const draft = drafts[line.id]
              const editable = !readOnly && lineIsEditable(line.status) && draft
              const name = prescriptionLineDisplayName(line)
              const busy = pending && busyLineId === line.id
              const showSendBack = sendBackLineId === line.id

              if (!editable) {
                return (
                  <div
                    key={line.id}
                    data-testid={`rx-line-${line.id}`}
                    className="rounded-md border border-line-soft/70 bg-muted/20 px-3 py-2"
                  >
                    <div className="flex items-start gap-1.5 text-xs font-medium">
                      {line.status === 'dispensed' ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" aria-hidden />
                      ) : line.status === 'needs_clarification' ? (
                        <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-ink" aria-hidden />
                      ) : null}
                      <span className="break-words">{name}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Rx {prescribedShort(line)} · {lineOutcomeLabel(line.status)}
                    </div>
                  </div>
                )
              }

              const stockOptions = stockOptionsForLine(line, draft)
              const stockList = draft.substitute ? stock : stockOptions

              return (
                <div
                  key={line.id}
                  data-testid={`rx-line-${line.id}`}
                  className={cn(
                    'rounded-md border border-line-soft/70 px-3 py-2',
                    index % 2 === 0 ? 'bg-card' : 'bg-background',
                  )}
                >
                  <div className="text-xs font-medium break-words" title={name}>
                    {name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Rx {prescribedShort(line)}
                    {alreadyDispensed(line) > 0 && (
                      <>
                        {' · '}already dispensed {alreadyDispensed(line)} of{' '}
                        {line.quantity_prescribed ?? '—'}
                      </>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Qty
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={cn(field, 'w-16')}
                        value={draft.quantity_dispensed}
                        onChange={(e) =>
                          updateDraft(line.id, { quantity_dispensed: e.target.value })
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Unit
                      <input
                        className={cn(field, 'w-16')}
                        value={draft.quantity_unit}
                        onChange={(e) => updateDraft(line.id, { quantity_unit: e.target.value })}
                        disabled={busy}
                        placeholder="tabs"
                      />
                    </label>
                    <label className="flex min-w-[150px] flex-1 flex-col gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Stock
                      {draft.line_status === 'out_of_stock' ? (
                        <span className="py-1 text-xs normal-case text-muted-foreground">—</span>
                      ) : stockList.length === 0 ? (
                        <span className="py-1 text-xs normal-case text-muted-foreground">
                          No match
                        </span>
                      ) : (
                        <select
                          className={cn(field, 'w-full')}
                          value={draft.stock_item_id}
                          onChange={(e) => updateDraft(line.id, { stock_item_id: e.target.value })}
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
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Outcome
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
                    </label>
                    <div className="flex items-center gap-1 pb-0.5">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded bg-cobalt px-3 text-xs font-medium text-white disabled:opacity-60"
                        onClick={() => handleDispenseLine(line)}
                        disabled={busy}
                        data-testid={
                          line.id === firstEditableLineId ? 'save-complete' : `dispense-${line.id}`
                        }
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Dispense'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded px-1.5 text-xs text-muted-foreground hover:text-foreground"
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
                  </div>

                  {(draft.substitute || showSendBack) && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded bg-muted/30 px-2 py-1.5">
                      <label className="inline-flex items-center gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={draft.substitute}
                          onChange={(e) => updateDraft(line.id, { substitute: e.target.checked })}
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
                  )}
                </div>
              )
            })}
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
