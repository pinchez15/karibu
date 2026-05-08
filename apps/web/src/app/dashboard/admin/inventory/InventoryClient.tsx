'use client'

import { useState, useTransition } from 'react'
import { Plus, FlaskConical, Pill } from 'lucide-react'
import {
  setLabAvailability,
  setDrugAvailability,
  addCustomLab,
  addCustomDrug,
} from './actions'
import { cn } from '@/lib/utils'

export interface InventoryItem {
  name: string
  enabled: boolean
  notes: string | null
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
        onAdd={(name) => addCustomLab(name)}
        addPlaceholder="e.g. Rapid strep test"
        kind="lab"
      />
      <InventorySection
        title="Pharmacy"
        icon={<Pill className="h-4 w-4 text-cobalt" />}
        items={drugs}
        onToggle={(name, enabled) => setDrugAvailability(name, enabled)}
        onAdd={(name) => addCustomDrug(name)}
        addPlaceholder="e.g. Doxycycline 100mg"
        kind="drug"
      />
    </div>
  )
}

interface InventorySectionProps {
  title: string
  icon: React.ReactNode
  items: InventoryItem[]
  onToggle: (
    name: string,
    enabled: boolean,
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
  onAdd,
  addPlaceholder,
  kind,
}: InventorySectionProps) {
  const enabledCount = items.filter((i) => i.enabled).length
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
          <InventoryRow key={item.name} item={item} onToggle={onToggle} />
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
}

function InventoryRow({ item, onToggle }: InventoryRowProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(item.enabled)

  function flip(next: boolean) {
    setError(null)
    setEnabled(next) // optimistic
    startTransition(async () => {
      const result = await onToggle(item.name, next)
      if (!result.success) {
        setError(result.error)
        setEnabled(!next) // rollback
      }
    })
  }

  return (
    <div className="px-5 py-2.5 flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => flip(!enabled)}
        disabled={pending}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
          enabled ? 'bg-cobalt' : 'bg-line',
          pending && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span
        className={cn(
          'text-sm flex-1',
          enabled ? 'text-ink font-medium' : 'text-muted-foreground line-through decoration-1',
        )}
      >
        {item.name}
      </span>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
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
