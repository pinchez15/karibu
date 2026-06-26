'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, X, Loader2, Upload, ClipboardPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatStockUnitPrice } from '@/lib/money'
import {
  createLabStockItem,
  recordLabStockMovement,
  setLabStockActive,
} from './actions'

export type LabStockRow = {
  id: string
  test_code: string | null
  test_name: string
  category: string
  unit: string
  quantity_on_hand: number
  low_stock_threshold: number | null
  unit_price_ugx: number | null
  expires_at: string | null
  batch_number: string | null
  supplier: string | null
  notes: string | null
  active: boolean
}

type StockFilter = 'in_stock' | 'low' | 'out' | 'all'
type StockStatus = 'in_stock' | 'low' | 'out'

const FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'in_stock', label: 'In stock' },
  { id: 'low', label: 'Low' },
  { id: 'out', label: 'Out' },
  { id: 'all', label: 'All' },
]

const CATEGORIES = [
  { value: 'rdt_kit', label: 'RDT kit' },
  { value: 'reagent', label: 'Reagent' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'slide_stain', label: 'Slide / stain' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_LABELS: Record<string, string> = {
  rdt_kit: 'RDT kit',
  reagent: 'Reagent',
  consumable: 'Consumable',
  slide_stain: 'Slide / stain',
  other: 'Other',
}

const MOVEMENT_TYPES = [
  { value: 'received', label: 'Received (+)' },
  { value: 'consumed', label: 'Consumed (−)' },
  { value: 'expired', label: 'Expired (−)' },
  { value: 'adjusted', label: 'Adjusted (±)' },
  { value: 'transferred_in', label: 'Transferred in (+)' },
  { value: 'transferred_out', label: 'Transferred out (−)' },
] as const

function getStockStatus(row: LabStockRow): StockStatus {
  if (row.quantity_on_hand <= 0) return 'out'
  if (row.low_stock_threshold != null && row.quantity_on_hand <= row.low_stock_threshold) return 'low'
  return 'in_stock'
}

function matchesFilter(row: LabStockRow, filter: StockFilter): boolean {
  const status = getStockStatus(row)
  switch (filter) {
    case 'in_stock':
      return status === 'in_stock'
    case 'low':
      return status === 'low'
    case 'out':
      return status === 'out'
    default:
      return true
  }
}

function matchesQuery(row: LabStockRow, q: string): boolean {
  if (!q) return true
  const haystack = [row.test_name, row.test_code ?? '', row.category, row.unit]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

const STATUS_STYLES: Record<StockStatus, string> = {
  in_stock: 'bg-green-500/15 text-green-800',
  low: 'bg-amber-soft text-amber-ink',
  out: 'bg-destructive/10 text-destructive',
}

const STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'OK',
  low: 'Low',
  out: 'Out',
}

export function LabStockClient({ initialRows }: { initialRows: LabStockRow[] }) {
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
      if (status === 'out') counts.out++
    }
    return counts
  }, [activeRows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeRows
      .filter((r) => matchesFilter(r, filter))
      .filter((r) => matchesQuery(r, q))
      .sort((a, b) => a.test_name.localeCompare(b.test_name))
  }, [activeRows, filter, query])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, code, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs h-9"
        />
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/dashboard/admin/stock-import?tab=lab">
            <Upload className="h-4 w-4 mr-1" /> Import
          </Link>
        </Button>
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

      {showAdd && <AddLabStockForm onDone={() => setShowAdd(false)} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs table-fixed border-collapse">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="kh-meta border-b border-line-soft bg-muted/40 text-[10px]">
                <th className="text-left font-semibold px-3 py-2">Item</th>
                <th className="text-left font-semibold px-2 py-2">Category</th>
                <th className="text-right font-semibold px-2 py-2">On hand</th>
                <th className="text-right font-semibold px-2 py-2">Unit price</th>
                <th className="text-left font-semibold px-2 py-2">Expiry</th>
                <th className="text-center font-semibold px-2 py-2">Status</th>
                <th className="text-right font-semibold px-2 py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {query
                      ? 'No matches — try another search or filter.'
                      : filter === 'in_stock'
                        ? 'Nothing in stock right now. Check Low or Out filters.'
                        : 'No items in this filter.'}
                  </td>
                </tr>
              ) : (
                visible.map((row) => <LabStockRowItem key={row.id} row={row} />)
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

function LabStockRowItem({ row }: { row: LabStockRow }) {
  const [showMovement, setShowMovement] = useState(false)
  const status = getStockStatus(row)
  const categoryLabel = CATEGORY_LABELS[row.category] ?? row.category.replace(/_/g, ' ')

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 last:border-b-0 hover:bg-muted/30',
          status === 'low' && 'bg-amber-soft/20',
          status === 'out' && 'bg-destructive/[0.03]',
        )}
      >
        <td className="px-3 py-1.5 align-middle min-w-0">
          <div className="font-medium text-[13px] truncate leading-tight">{row.test_name}</div>
          {row.test_code && (
            <div className="text-[10px] text-muted-foreground font-mono truncate">{row.test_code}</div>
          )}
        </td>
        <td className="px-2 py-1.5 align-middle text-muted-foreground truncate" title={categoryLabel}>
          {categoryLabel}
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
            <DeactivateButton id={row.id} name={row.test_name} />
          </div>
        </td>
      </tr>
      {showMovement && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-3 py-2">
            <MovementForm row={row} onDone={() => setShowMovement(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function DeactivateButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={pending}
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={`Remove ${name} from active stock`}
      onClick={() =>
        startTransition(async () => {
          await setLabStockActive(id, false)
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  )
}

function MovementForm({ row, onDone }: { row: LabStockRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('stock_item_id', row.id)
    startTransition(async () => {
      const r = await recordLabStockMovement(formData)
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

function AddLabStockForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await createLabStockItem(formData)
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
          <Label htmlFor="test_name">Item name *</Label>
          <Input id="test_name" name="test_name" placeholder="Malaria RDT 25-test kit" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test_code">Test code</Label>
          <Input id="test_code" name="test_code" placeholder="MAL_RDT (optional)" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">Category *</Label>
          <select
            id="category"
            name="category"
            defaultValue="rdt_kit"
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit">Unit *</Label>
          <Input id="unit" name="unit" placeholder="tests / kits / mL" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="initial_quantity">Opening qty</Label>
          <Input id="initial_quantity" name="initial_quantity" type="number" step="any" defaultValue={0} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="low_stock_threshold">Low at</Label>
          <Input id="low_stock_threshold" name="low_stock_threshold" type="number" step="any" defaultValue={5} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit_price_ugx">Unit price (UGX)</Label>
          <Input id="unit_price_ugx" name="unit_price_ugx" type="number" step="1" placeholder="2000" />
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
