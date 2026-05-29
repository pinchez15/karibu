'use client'

import { useState, useTransition } from 'react'
import { Plus, FlaskConical, Pill } from 'lucide-react'
import {
  setLabAvailability,
  setDrugAvailability,
  addCustomLab,
  addCustomDrug,
  updateLabCatalogFields,
  updateDrugCatalogFields,
} from './actions'
import { cn } from '@/lib/utils'

export interface InventoryItem {
  name: string
  enabled: boolean
  notes: string | null
  code: string | null
  category: string | null
  display_order: number
  active: boolean
}

interface InventoryClientProps {
  labs: InventoryItem[]
  drugs: InventoryItem[]
}

export function InventoryClient({ labs, drugs }: InventoryClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <InventorySection
        title="Lab tests"
        icon={<FlaskConical className="h-4 w-4 text-cobalt" />}
        items={labs}
        onToggle={(name, enabled) => setLabAvailability(name, enabled)}
        onUpdate={(name, fields) => updateLabCatalogFields(name, fields)}
        onAdd={(name) => addCustomLab(name)}
        addPlaceholder="e.g. Rapid strep test"
        kind="lab"
      />
      <InventorySection
        title="Pharmacy"
        icon={<Pill className="h-4 w-4 text-cobalt" />}
        items={drugs}
        onToggle={(name, enabled) => setDrugAvailability(name, enabled)}
        onUpdate={(name, fields) => updateDrugCatalogFields(name, fields)}
        onAdd={(name) => addCustomDrug(name)}
        addPlaceholder="e.g. Doxycycline 100mg"
        kind="drug"
      />
    </div>
  )
}

type CatalogFields = {
  code?: string | null
  category?: string | null
  display_order?: number
  active?: boolean
}

interface InventorySectionProps {
  title: string
  icon: React.ReactNode
  items: InventoryItem[]
  onToggle: (
    name: string,
    enabled: boolean,
  ) => Promise<{ success: true } | { success: false; error: string }>
  onUpdate: (
    name: string,
    fields: CatalogFields,
  ) => Promise<{ success: true } | { success: false; error: string }>
  onAdd: (name: string) => Promise<{ success: true } | { success: false; error: string }>
  addPlaceholder: string
  kind: 'lab' | 'drug'
}

function InventorySection({
  title,
  icon,
  items,
  onToggle,
  onUpdate,
  onAdd,
  addPlaceholder,
  kind,
}: InventorySectionProps) {
  const enabledCount = items.filter((i) => i.enabled && i.active).length
  const total = items.length

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold">{title}</span>
        </div>
        <span className="kh-meta">
          {enabledCount} OF {total} ENABLED
        </span>
      </div>

      <div className="divide-y divide-line-soft">
        {items.map((item) => (
          <InventoryRow key={item.name} item={item} onToggle={onToggle} onUpdate={onUpdate} />
        ))}
      </div>

      <AddItemRow onAdd={onAdd} placeholder={addPlaceholder} kind={kind} />
    </div>
  )
}

interface InventoryRowProps {
  item: InventoryItem
  onToggle: (
    name: string,
    enabled: boolean,
  ) => Promise<{ success: true } | { success: false; error: string }>
  onUpdate: (
    name: string,
    fields: CatalogFields,
  ) => Promise<{ success: true } | { success: false; error: string }>
}

function InventoryRow({ item, onToggle, onUpdate }: InventoryRowProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(item.enabled)
  const [code, setCode] = useState(item.code ?? '')
  const [category, setCategory] = useState(item.category ?? '')
  const [displayOrder, setDisplayOrder] = useState(String(item.display_order))
  const [active, setActive] = useState(item.active)

  function flip(next: boolean) {
    setError(null)
    setEnabled(next)
    startTransition(async () => {
      const result = await onToggle(item.name, next)
      if (!result.success) {
        setError(result.error)
        setEnabled(!next)
      }
    })
  }

  function saveMeta() {
    setError(null)
    const order = Number.parseInt(displayOrder, 10)
    startTransition(async () => {
      const result = await onUpdate(item.name, {
        code: code.trim() || null,
        category: category.trim() || null,
        display_order: Number.isFinite(order) ? order : 0,
        active,
      })
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="px-5 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => flip(!enabled)}
          disabled={pending || !active}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
            enabled && active ? 'bg-cobalt' : 'bg-line',
            pending && 'opacity-60',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
              enabled && active ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
        <span
          className={cn(
            'text-sm flex-1',
            enabled && active
              ? 'text-ink font-medium'
              : 'text-muted-foreground line-through decoration-1',
          )}
        >
          {item.name}
        </span>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={pending}
          />
          Active
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2 pl-12">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          className="text-xs border border-border rounded-md px-2 py-1 bg-background"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="text-xs border border-border rounded-md px-2 py-1 bg-background"
        />
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          placeholder="Order"
          className="text-xs border border-border rounded-md px-2 py-1 bg-background"
        />
      </div>
      <div className="pl-12 flex items-center gap-2">
        <button
          type="button"
          onClick={saveMeta}
          disabled={pending}
          className="text-xs font-medium text-cobalt hover:underline disabled:opacity-50"
        >
          Save catalog fields
        </button>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </div>
    </div>
  )
}

interface AddItemRowProps {
  onAdd: (name: string) => Promise<{ success: true } | { success: false; error: string }>
  placeholder: string
  kind: 'lab' | 'drug'
}

function AddItemRow({ onAdd, placeholder, kind }: AddItemRowProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (name.trim().length < 2) {
      setError('Enter a longer name')
      return
    }
    startTransition(async () => {
      const result = await onAdd(name.trim())
      if (!result.success) {
        setError(result.error)
        return
      }
      setName('')
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-5 py-3 flex items-center gap-2 text-sm text-cobalt font-medium hover:bg-background/60 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add custom {kind === 'lab' ? 'test' : 'drug'}
      </button>
    )
  }

  return (
    <div className="px-5 py-3 space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') {
            setOpen(false)
            setName('')
            setError(null)
          }
        }}
        placeholder={placeholder}
        className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
        autoFocus
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length < 2}
          className="bg-cobalt text-white rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setName('')
            setError(null)
          }}
          className="text-muted-foreground hover:text-body text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
