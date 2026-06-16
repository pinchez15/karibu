'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { listClinicPharmacyStock, recordDispenseAndStock } from './actions'
import { captureStationDetailDispense } from '@/lib/station-analytics'

type StockOption = Awaited<ReturnType<typeof listClinicPharmacyStock>>[number]

export function DispenseWithStockDialog({
  visitId,
  medicationsText,
  initialNotes,
  onClose,
  onSuccess,
}: {
  visitId: string
  medicationsText: string
  initialNotes: string
  onClose: () => void
  onSuccess?: (status: 'dispensed' | 'partial' | 'out_of_stock') => void
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
        captureStationDetailDispense({ visit_id: visitId })
        onSuccess?.(status)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Dispense + decrement stock</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Records the dispense + creates negative stock movements per line.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          {medicationsText && (
            <div className="rounded-md bg-muted/40 p-2">
              <div className="kh-meta">PRESCRIBED</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{medicationsText}</p>
            </div>
          )}

          {loadError && <div className="text-sm text-destructive">{loadError}</div>}

          <div className="space-y-2">
            <div className="kh-meta">DEDUCT FROM</div>
            {lines.map((line) => {
              const selected = stockOptions.find((s) => s.id === line.stockItemId)
              return (
                <div key={line.id} className="grid grid-cols-[1fr_120px_auto] items-start gap-2">
                  <select
                    value={line.stockItemId}
                    onChange={(e) => updateLine(line.id, { stockItemId: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
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
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    placeholder={selected ? `qty in ${selected.unit}` : 'qty'}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
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
              className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline"
            >
              <Plus className="h-3 w-3" /> Add another item
            </button>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div>
              <label className="kh-meta">DISPENSE STATUS</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-md bg-destructive/5 p-2 text-sm text-destructive">
              {submitError}
              {partialFailures.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {partialFailures.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-body"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Record dispense
          </button>
        </div>
      </div>
    </div>
  )
}
