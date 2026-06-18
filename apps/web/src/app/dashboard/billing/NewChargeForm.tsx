'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchBillingPatients, addCharge, type BillingPatientHit } from './actions'

const CATEGORIES = [
  { value: 'consultation', label: 'Consultation (visit)' },
  { value: 'lab', label: 'Lab' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'other', label: 'Other' },
]

export function NewChargeForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BillingPatientHit[]>([])
  const [searching, startSearch] = useTransition()
  const [patient, setPatient] = useState<BillingPatientHit | null>(null)
  const [category, setCategory] = useState('consultation')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [pending, startSubmit] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPatient(null)
    setQuery('')
    setHits([])
    setCategory('consultation')
    setDescription('')
    setAmount('')
    setError(null)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        New charge
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">New charge</h3>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset() }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Patient picker */}
      {patient ? (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
          <span className="font-medium">
            {patient.name}
            {patient.number != null && <span className="text-muted-foreground"> #{patient.number}</span>}
          </span>
          <button type="button" className="text-xs text-cobalt hover:underline" onClick={() => setPatient(null)}>
            Change
          </button>
        </div>
      ) : (
        <div className="mb-3">
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
            <ul className="mt-1 divide-y divide-line-soft rounded-md border border-border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/40"
                    onClick={() => { setPatient(h); setHits([]) }}
                  >
                    <span>{h.name}</span>
                    {h.number != null && <span className="text-xs text-muted-foreground">#{h.number}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-[11px]">Service line</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. OPD consultation" />
        </div>
        <div>
          <Label className="text-[11px]">Amount (UGX)</Label>
          <Input type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 flex justify-end">
        <Button
          disabled={pending || !patient || !description.trim() || amount.trim() === ''}
          onClick={() => {
            setError(null)
            if (!patient) return
            startSubmit(async () => {
              const r = await addCharge({
                patientId: patient.id,
                category,
                description,
                amountUgx: Number(amount),
              })
              if (!r.success) {
                setError(r.error)
                return
              }
              setOpen(false)
              reset()
              router.refresh()
            })
          }}
        >
          {pending ? 'Adding…' : 'Add charge'}
        </Button>
      </div>
    </div>
  )
}
