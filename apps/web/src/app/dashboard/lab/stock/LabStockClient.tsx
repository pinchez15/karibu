'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, X, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
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
  expires_at: string | null
  batch_number: string | null
  supplier: string | null
  notes: string | null
  active: boolean
}

const CATEGORIES = [
  { value: 'rdt_kit', label: 'RDT kit' },
  { value: 'reagent', label: 'Reagent' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'slide_stain', label: 'Slide / stain' },
  { value: 'other', label: 'Other' },
]

const MOVEMENT_TYPES = [
  { value: 'received', label: 'Received (+)' },
  { value: 'consumed', label: 'Consumed (−)' },
  { value: 'expired', label: 'Expired (−)' },
  { value: 'adjusted', label: 'Adjusted (±)' },
  { value: 'transferred_in', label: 'Transferred in (+)' },
  { value: 'transferred_out', label: 'Transferred out (−)' },
] as const

export function LabStockClient({ initialRows }: { initialRows: LabStockRow[] }) {
  const [rows] = useState(initialRows)
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter(r => r.active)
      .filter(r => !q || r.test_name.toLowerCase().includes(q) || (r.test_code ?? '').toLowerCase().includes(q))
  }, [rows, query])

  const lowStockCount = visible.filter(r =>
    r.low_stock_threshold != null && r.quantity_on_hand <= r.low_stock_threshold,
  ).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search tests / reagents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add stock item
        </Button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{visible.length} active</span>
          {lowStockCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-ink bg-amber-soft px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" /> {lowStockCount} low
            </span>
          )}
        </div>
      </div>

      {showAdd && <AddLabStockForm onDone={() => setShowAdd(false)} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2fr_140px_140px_140px_180px] gap-3 px-4 py-2.5 kh-meta border-b border-line-soft bg-muted/40">
          <span>ITEM</span>
          <span>CATEGORY</span>
          <span>ON HAND</span>
          <span>EXPIRY</span>
          <span>ACTIONS</span>
        </div>
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {query ? 'No matching items.' : 'No stock items yet — tap "Add stock item" to start.'}
          </div>
        ) : (
          visible.map(row => <LabStockRowItem key={row.id} row={row} />)
        )}
      </div>
    </div>
  )
}

function LabStockRowItem({ row }: { row: LabStockRow }) {
  const [showMovement, setShowMovement] = useState(false)
  const isLow = row.low_stock_threshold != null && row.quantity_on_hand <= row.low_stock_threshold

  return (
    <div className={cn('border-b border-border last:border-b-0', isLow && 'bg-amber-soft/30')}>
      <div className="grid grid-cols-[2fr_140px_140px_140px_180px] gap-3 px-4 py-3 items-center">
        <div>
          <div className="font-medium">{row.test_name}</div>
          {row.test_code && (
            <div className="text-[11px] text-muted-foreground font-mono">{row.test_code}</div>
          )}
        </div>
        <div className="text-sm text-muted-foreground capitalize">
          {row.category.replace('_', ' ')}
        </div>
        <div>
          <div className={cn('text-sm font-semibold', isLow && 'text-amber-ink')}>
            {row.quantity_on_hand} {row.unit}
          </div>
          {row.low_stock_threshold != null && (
            <div className="text-[11px] text-muted-foreground">
              Low at {row.low_stock_threshold}
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {row.expires_at
            ? new Date(row.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowMovement((s) => !s)}>
            {showMovement ? 'Cancel' : 'Record'}
          </Button>
          <ToggleActiveButton id={row.id} />
        </div>
      </div>
      {showMovement && <MovementForm row={row} onDone={() => setShowMovement(false)} />}
    </div>
  )
}

function ToggleActiveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLabStockActive(id, false)
        })
      }
    >
      <X className="h-3.5 w-3.5" />
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
    <form action={handleSubmit} className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-[160px_120px_140px_140px_1fr_auto] gap-2 items-end bg-card/50">
      <div>
        <Label className="text-[11px]">Type</Label>
        <select name="movement_type" defaultValue="received" className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background">
          {MOVEMENT_TYPES.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-[11px]">Quantity</Label>
        <Input name="quantity" type="number" step="any" required placeholder={`${row.unit}`} />
      </div>
      <div>
        <Label className="text-[11px]">Batch</Label>
        <Input name="batch_number" placeholder="Optional" />
      </div>
      <div>
        <Label className="text-[11px]">Expires</Label>
        <Input name="expires_at" type="date" />
      </div>
      <div>
        <Label className="text-[11px]">Notes</Label>
        <Input name="notes" placeholder="Optional" />
      </div>
      <div className="flex flex-col gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
        {error && <div className="text-[11px] text-destructive">{error}</div>}
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
    <form
      action={handleSubmit}
      className="bg-card border border-border rounded-xl p-4 space-y-3"
    >
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
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
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
