'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchBillingPatients, type BillingPatientHit } from './actions'

export function NewChargeForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BillingPatientHit[]>([])
  const [searching, startSearch] = useTransition()

  function reset() {
    setQuery('')
    setHits([])
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        New bill
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 w-full max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Open patient bill</h3>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset() }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Find a patient to view their itemized bill, build charges from care, or record payment.
      </p>
      <Label className="text-[11px]">Patient</Label>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              startSearch(async () => setHits(await searchBillingPatients(query)))
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={searching || query.trim().length < 2}
          onClick={() => startSearch(async () => setHits(await searchBillingPatients(query)))}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line-soft rounded-md border border-border">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/40"
                onClick={() => {
                  setOpen(false)
                  reset()
                  router.push(`/dashboard/billing/${h.id}`)
                }}
              >
                <span>{h.name}</span>
                {h.number != null && <span className="text-xs text-muted-foreground">#{h.number}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
