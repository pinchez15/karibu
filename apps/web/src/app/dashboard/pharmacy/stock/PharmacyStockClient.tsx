'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, X, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
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

// Drug names are entered inconsistently (ALL CAPS, lower, mixed). Normalize to
// sentence case for a consistent column — first letter upper, the rest lower.
function toSentenceCase(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

// Form selection options.
//
// Formulation drives the default unit so a tablet stock entry doesn't end up
// counted in mL by accident — but the form keeps the unit editable in case
// the clinic counts e.g. blister packs of 10 instead of individual tabs.
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

export function PharmacyStockClient({ initialRows }: { initialRows: PharmacyStockRow[] }) {
  const [rows] = useState(initialRows)
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter(r => r.active)
      .filter(r => !q || r.drug_name.toLowerCase().includes(q) || r.drug_code.toLowerCase().includes(q))
  }, [rows, query])

  const lowStockCount = visible.filter(r =>
    r.low_stock_threshold != null && r.quantity_on_hand <= r.low_stock_threshold,
  ).length

  // "Out of stock" = on-hand depleted OR explicitly marked unavailable
  // ("once stocked but can't be obtained right now"). Surfaced as a list so
  // the dispenser and the Today board see at a glance what can't be given.
  const outOfStock = useMemo(
    () => rows.filter(r => r.active && (r.quantity_on_hand <= 0 || r.is_unavailable)),
    [rows],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search drugs…"
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

      {showAdd && <AddStockForm onDone={() => setShowAdd(false)} />}

      {outOfStock.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
          <div className="px-4 py-2.5 kh-meta text-destructive border-b border-destructive/20">
            OUT OF STOCK — {outOfStock.length}
          </div>
          <ul className="divide-y divide-destructive/10">
            {outOfStock.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                <span className="font-medium truncate">{toSentenceCase(r.drug_name)}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground">
                    {r.is_unavailable ? 'Unavailable' : `0 ${r.unit}`}
                  </span>
                  <UnavailableToggle id={r.id} unavailable={!!r.is_unavailable} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.5fr)_110px_120px_120px_120px_150px] gap-2 px-4 py-2.5 kh-meta border-b border-line-soft bg-muted/40">
          <span>DRUG</span>
          <span>STRENGTH</span>
          <span>FORMULATION</span>
          <span>ON HAND</span>
          <span>EXPIRY</span>
          <span>ACTIONS</span>
        </div>
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {query ? 'No matching stock items.' : 'No stock items yet — tap "Add stock item" to start.'}
          </div>
        ) : (
          visible.map(row => <StockRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  )
}

function StockRow({ row }: { row: PharmacyStockRow }) {
  const [showMovement, setShowMovement] = useState(false)
  const isLow = row.low_stock_threshold != null && row.quantity_on_hand <= row.low_stock_threshold

  return (
    <div className={cn('border-b border-border last:border-b-0', isLow && 'bg-amber-soft/30')}>
      <div className="grid grid-cols-[minmax(0,1.5fr)_110px_120px_120px_120px_150px] gap-2 px-4 py-2 items-center">
        <div className="min-w-0">
          <div className="font-medium truncate">{toSentenceCase(row.drug_name)}</div>
        </div>
        <div className="text-sm">{row.strength ?? '—'}</div>
        <div className="text-sm text-muted-foreground">{row.formulation}</div>
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
          <UnavailableToggle id={row.id} unavailable={!!row.is_unavailable} />
        </div>
      </div>
      {showMovement && <MovementForm row={row} onDone={() => setShowMovement(false)} />}
    </div>
  )
}

// Mark a drug unavailable ("once stocked but can't be obtained right now") or
// available again. Distinct from on-hand quantity — drives the out-of-stock
// list at the top of the page (and the Today out-of-stock alert).
function UnavailableToggle({ id, unavailable }: { id: string; unavailable: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      className="text-[11px]"
      onClick={() =>
        startTransition(async () => {
          await setPharmacyStockUnavailable(id, !unavailable)
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : unavailable ? 'Mark available' : 'Mark unavailable'}
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

function AddStockForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [formulation, setFormulation] = useState('tablet')
  const [unit, setUnit] = useState('tablets')

  function handleFormulationChange(value: string) {
    setFormulation(value)
    const match = FORMULATIONS.find(f => f.value === value)
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
            {FORMULATIONS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
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
