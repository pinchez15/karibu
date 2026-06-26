'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, X, Loader2, Upload, Ban, CircleCheck, ClipboardPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatStockUnitPrice, patientUnitPriceFromStock } from '@/lib/money'
import {
  createPharmacyStockItem,
  recordPharmacyStockMovement,
  setPharmacyStockUnavailable,
} from './actions'

export type PharmacyStockRow = {
  id: string
  drug_code: string
  drug_name: string
  formulation: string
  strength: string | null
  unit: string
  quantity_on_hand: number
  low_stock_threshold: number | null
  unit_price_ugx: number | null
  expires_at: string | null
  batch_number: string | null
  supplier: string | null
  notes: string | null
  active: boolean
  is_unavailable: boolean | null
}

type StockFilter = 'in_stock' | 'low' | 'out' | 'all'
type StockStatus = 'in_stock' | 'low' | 'out' | 'unavailable'

const FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'in_stock', label: 'In stock' },
  { id: 'low', label: 'Low' },
  { id: 'out', label: 'Out' },
  { id: 'all', label: 'All' },
]

const FORMULATIONS: { value: string; label: string; defaultUnit: string }[] = [
  { value: 'tablet', label: 'Tablet', defaultUnit: 'tablets' },
  { value: 'capsule', label: 'Capsule', defaultUnit: 'capsules' },
  { value: 'liquid', label: 'Liquid', defaultUnit: 'mL' },
  { value: 'syrup', label: 'Syrup', defaultUnit: 'mL' },
  { value: 'suspension', label: 'Suspension', defaultUnit: 'mL' },
  { value: 'injection', label: 'Injection', defaultUnit: 'vials' },
  { value: 'powder', label: 'Powder', defaultUnit: 'g' },
  { value: 'inhaler', label: 'Inhaler', defaultUnit: 'inhalers' },
  { value: 'drops', label: 'Drops', defaultUnit: 'mL' },
  { value: 'cream', label: 'Cream', defaultUnit: 'g' },
  { value: 'ointment', label: 'Ointment', defaultUnit: 'g' },
  { value: 'sachet', label: 'Sachet', defaultUnit: 'sachets' },
  { value: 'vial', label: 'Vial', defaultUnit: 'vials' },
  { value: 'patch', label: 'Patch', defaultUnit: 'patches' },
  { value: 'other', label: 'Other', defaultUnit: 'units' },
]

const MOVEMENT_TYPES = [
  { value: 'received', label: 'Received (+)' },
  { value: 'dispensed', label: 'Dispensed (−)' },
  { value: 'expired', label: 'Expired (−)' },
  { value: 'adjusted', label: 'Adjusted (±)' },
  { value: 'transferred_in', label: 'Transferred in (+)' },
  { value: 'transferred_out', label: 'Transferred out (−)' },
] as const

function toSentenceCase(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

function getStockStatus(row: PharmacyStockRow): StockStatus {
  if (row.is_unavailable) return 'unavailable'
  if (row.quantity_on_hand <= 0) return 'out'
  if (row.low_stock_threshold != null && row.quantity_on_hand <= row.low_stock_threshold) return 'low'
  return 'in_stock'
}

function matchesFilter(row: PharmacyStockRow, filter: StockFilter): boolean {
  const status = getStockStatus(row)
  switch (filter) {
    case 'in_stock':
      return status === 'in_stock'
    case 'low':
      return status === 'low'
    case 'out':
      return status === 'out' || status === 'unavailable'
    default:
      return true
  }
}

function matchesQuery(row: PharmacyStockRow, q: string): boolean {
  if (!q) return true
  const haystack = [
    row.drug_name,
    row.drug_code,
    row.strength ?? '',
    row.formulation,
    row.unit,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function skuLabel(row: PharmacyStockRow): string {
  const parts = [row.strength, row.formulation].filter(Boolean)
  return parts.join(' · ')
}

const STATUS_STYLES: Record<StockStatus, string> = {
  in_stock: 'bg-green-500/15 text-green-800',
  low: 'bg-amber-soft text-amber-ink',
  out: 'bg-destructive/10 text-destructive',
  unavailable: 'bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'OK',
  low: 'Low',
  out: 'Out',
  unavailable: 'N/A',
}

export function PharmacyStockClient({
  initialRows,
  pharmacyMarkupPercent = 10,
}: {
  initialRows: PharmacyStockRow[]
  pharmacyMarkupPercent?: number
}) {
  const [rows] = useState(initialRows)
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('in_stock')

  const activeRows = useMemo(() => rows.filter((r) => r.active), [rows])

  const filterCounts = useMemo(() => {
    const counts: Record<StockFilter, number> = { in_stock: 0, low: 0, out: 0, all: 0 }
    counts.all = activeRows.length
    for (const row of activeRows) {
      const status = getStockStatus(row)
      if (status === 'in_stock') counts.in_stock++
      if (status === 'low') counts.low++
      if (status === 'out' || status === 'unavailable') counts.out++
    }
    return counts
  }, [activeRows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeRows
      .filter((r) => matchesFilter(r, filter))
      .filter((r) => matchesQuery(r, q))
      .sort((a, b) => a.drug_name.localeCompare(b.drug_name))
  }, [activeRows, filter, query])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, strength, form, code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs h-9"
        />
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/dashboard/admin/stock-import?tab=pharmacy">
            <Upload className="h-4 w-4 mr-1" /> Import
          </Link>
        </Button>
        <div className="ml-auto text-[11px] text-muted-foreground">
          Bill +{pharmacyMarkupPercent}% on unit price
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-cobalt text-white'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted',
            )}
          >
            {f.label}
            <span
              className={cn(
                'tabular-nums rounded-full px-1.5 py-px text-[10px]',
                filter === f.id ? 'bg-white/20' : 'bg-background',
              )}
            >
              {filterCounts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {showAdd && <AddStockForm onDone={() => setShowAdd(false)} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs table-fixed border-collapse">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="kh-meta border-b border-line-soft bg-muted/40 text-[10px]">
                <th className="text-left font-semibold px-3 py-2">Drug</th>
                <th className="text-left font-semibold px-2 py-2">Strength · form</th>
                <th className="text-right font-semibold px-2 py-2">On hand</th>
                <th className="text-right font-semibold px-2 py-2">Unit</th>
                <th className="text-right font-semibold px-2 py-2">Bill</th>
                <th className="text-left font-semibold px-2 py-2">Expiry</th>
                <th className="text-center font-semibold px-2 py-2">Status</th>
                <th className="text-right font-semibold px-2 py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {query
                      ? 'No matches — try another search or filter.'
                      : filter === 'in_stock'
                        ? 'Nothing in stock right now. Check Low or Out filters.'
                        : 'No items in this filter.'}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <StockRow key={row.id} row={row} pharmacyMarkupPercent={pharmacyMarkupPercent} />
                ))
              )}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground">
            Showing {visible.length} of {filterCounts[filter]}
            {filter !== 'all' ? ` (${filterCounts.all} total)` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function StockRow({
  row,
  pharmacyMarkupPercent,
}: {
  row: PharmacyStockRow
  pharmacyMarkupPercent: number
}) {
  const [showMovement, setShowMovement] = useState(false)
  const status = getStockStatus(row)
  const billUnit = patientUnitPriceFromStock(row.unit_price_ugx, pharmacyMarkupPercent)
  const sku = skuLabel(row)

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 last:border-b-0 hover:bg-muted/30',
          status === 'low' && 'bg-amber-soft/20',
          (status === 'out' || status === 'unavailable') && 'bg-destructive/[0.03]',
        )}
      >
        <td className="px-3 py-1.5 align-middle min-w-0">
          <div className="font-medium text-[13px] truncate leading-tight">
            {toSentenceCase(row.drug_name)}
          </div>
          {row.drug_code && (
            <div className="text-[10px] text-muted-foreground font-mono truncate">{row.drug_code}</div>
          )}
        </td>
        <td className="px-2 py-1.5 align-middle text-muted-foreground truncate" title={sku}>
          {sku || '—'}
        </td>
        <td className="px-2 py-1.5 align-middle text-right tabular-nums">
          <span className={cn('font-semibold', status === 'low' && 'text-amber-ink')}>
            {row.quantity_on_hand}
          </span>
          <span className="text-muted-foreground ml-0.5">{row.unit}</span>
          {row.low_stock_threshold != null && (
            <div className="text-[10px] text-muted-foreground">≤{row.low_stock_threshold}</div>
          )}
        </td>
        <td className="px-2 py-1.5 align-middle text-right font-mono tabular-nums">
          {formatStockUnitPrice(row.unit_price_ugx)}
        </td>
        <td className="px-2 py-1.5 align-middle text-right font-mono tabular-nums text-muted-foreground">
          {formatStockUnitPrice(billUnit)}
        </td>
        <td className="px-2 py-1.5 align-middle text-muted-foreground whitespace-nowrap">
          {row.expires_at
            ? new Date(row.expires_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
              })
            : '—'}
        </td>
        <td className="px-2 py-1.5 align-middle text-center">
          <span
            className={cn(
              'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              STATUS_STYLES[status],
            )}
          >
            {STATUS_LABELS[status]}
          </span>
        </td>
        <td className="px-2 py-1.5 pr-3 align-middle">
          <div className="flex items-center justify-end gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={showMovement ? 'Cancel stock movement' : 'Record stock movement'}
              onClick={() => setShowMovement((s) => !s)}
            >
              {showMovement ? <X className="h-3.5 w-3.5" /> : <ClipboardPlus className="h-3.5 w-3.5" />}
            </Button>
            <UnavailableToggle id={row.id} unavailable={!!row.is_unavailable} />
          </div>
        </td>
      </tr>
      {showMovement && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-3 py-2">
            <MovementForm row={row} onDone={() => setShowMovement(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function UnavailableToggle({ id, unavailable }: { id: string; unavailable: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={pending}
      className={cn('h-7 w-7 shrink-0', unavailable && 'text-amber-ink')}
      aria-label={unavailable ? 'Mark available' : 'Mark unavailable'}
      onClick={() =>
        startTransition(async () => {
          await setPharmacyStockUnavailable(id, !unavailable)
        })
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : unavailable ? (
        <CircleCheck className="h-3.5 w-3.5" />
      ) : (
        <Ban className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}

function MovementForm({ row, onDone }: { row: PharmacyStockRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('stock_item_id', row.id)
    startTransition(async () => {
      const r = await recordPharmacyStockMovement(formData)
      if (!r.success) setError(r.error)
      else onDone()
    })
  }

  return (
    <form
      action={handleSubmit}
      className="grid grid-cols-2 sm:grid-cols-[140px_100px_120px_120px_1fr_auto] gap-2 items-end"
    >
      <div>
        <Label className="text-[10px]">Type</Label>
        <select
          name="movement_type"
          defaultValue="received"
          className="w-full h-8 text-xs border border-border rounded-md px-2 bg-background"
        >
          {MOVEMENT_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-[10px]">Qty</Label>
        <Input name="quantity" type="number" step="any" required className="h-8 text-xs" />
      </div>
      <div>
        <Label className="text-[10px]">Batch</Label>
        <Input name="batch_number" className="h-8 text-xs" placeholder="Optional" />
      </div>
      <div>
        <Label className="text-[10px]">Expires</Label>
        <Input name="expires_at" type="date" className="h-8 text-xs" />
      </div>
      <div>
        <Label className="text-[10px]">Notes</Label>
        <Input name="notes" className="h-8 text-xs" placeholder="Optional" />
      </div>
      <div className="flex flex-col gap-1">
        <Button type="submit" size="sm" className="h-8" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
        {error && <div className="text-[10px] text-destructive">{error}</div>}
      </div>
    </form>
  )
}

function AddStockForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [formulation, setFormulation] = useState('tablet')
  const [unit, setUnit] = useState('tablets')

  function handleFormulationChange(value: string) {
    setFormulation(value)
    const match = FORMULATIONS.find((f) => f.value === value)
    if (match) setUnit(match.defaultUnit)
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('formulation', formulation)
    formData.set('unit', unit)
    startTransition(async () => {
      const r = await createPharmacyStockItem(formData)
      if (!r.success) setError(r.error)
      else onDone()
    })
  }

  return (
    <form action={handleSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Add stock item</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="drug_name">Drug name *</Label>
          <Input id="drug_name" name="drug_name" placeholder="Amoxicillin" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="drug_code">Code</Label>
          <Input id="drug_code" name="drug_code" placeholder="AMOX (optional)" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="strength">Strength</Label>
          <Input id="strength" name="strength" placeholder="500mg / 125mg per 5mL" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="formulation">Formulation *</Label>
          <select
            id="formulation"
            value={formulation}
            onChange={(e) => handleFormulationChange(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
          >
            {FORMULATIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit">Unit *</Label>
          <Input
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="tablets / mL / g"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="initial_quantity">Opening qty</Label>
          <Input id="initial_quantity" name="initial_quantity" type="number" step="any" defaultValue={0} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="low_stock_threshold">Low at</Label>
          <Input id="low_stock_threshold" name="low_stock_threshold" type="number" step="any" defaultValue={10} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit_price_ugx">Price (UGX)</Label>
          <Input id="unit_price_ugx" name="unit_price_ugx" type="number" step="1" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="batch_number">Batch</Label>
          <Input id="batch_number" name="batch_number" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expires_at">Expires</Label>
          <Input id="expires_at" name="expires_at" type="date" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="supplier">Supplier</Label>
          <Input id="supplier" name="supplier" />
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" />
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
