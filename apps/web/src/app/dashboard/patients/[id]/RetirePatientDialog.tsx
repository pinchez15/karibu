'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Patient } from '@karibu/shared'
import { searchPatients } from '@/app/dashboard/actions'
import { retirePatient } from './actions'

const SEARCH_DEBOUNCE_MS = 300

function hitLabel(hit: Patient): string {
  const name =
    [hit.first_name, hit.last_name].filter(Boolean).join(' ') ||
    hit.display_name ||
    'Unknown'
  return hit.patient_id != null ? `${name} (#${hit.patient_id})` : name
}

/**
 * Admin-only "Retire duplicate" dialog (FEAT: soft-retire, migration 111).
 * Reason is required; optionally point the retired record at the surviving
 * one via the existing patient search (which already excludes retired rows).
 * Never a delete — history stays intact and the chart keeps rendering with
 * a Retired banner.
 */
export function RetirePatientDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patientName: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<Patient | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setReason('')
      setQuery('')
      setHits([])
      setMergeTarget(null)
      setError(null)
      setSearching(false)
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
    }
  }, [open])

  // Debounced merge-target search. searchPatients is clinic-scoped and
  // already filters out retired records; we additionally drop this patient.
  useEffect(() => {
    if (!open) return
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimerRef.current = setTimeout(() => {
      void searchPatients(term).then((results) => {
        setHits(results.filter((r) => r.id !== patientId))
        setSearching(false)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
    }
  }, [query, open, patientId])

  const handleRetire = () => {
    setError(null)
    if (!reason.trim()) {
      setError('Enter a reason — it is kept on the record for audit.')
      return
    }
    startTransition(async () => {
      const result = await retirePatient({
        patient_id: patientId,
        reason: reason.trim(),
        merged_into_patient_id: mergeTarget?.id ?? null,
        client_op_id: crypto.randomUUID(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Retire duplicate record</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Retiring hides <span className="font-medium text-foreground">{patientName}</span>{' '}
            from search and check-in. Past visits, notes and payments are kept and
            still count in reports. This is not a delete.
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="retire-reason">Reason *</Label>
            <Textarea
              id="retire-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Registered twice at the front desk on 14 Jul — same person as #123."
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="retire-merge-search">
              Surviving record{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            {mergeTarget ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm">
                <span>{hitLabel(mergeTarget)}</span>
                <button
                  type="button"
                  aria-label="Clear surviving record"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMergeTarget(null)}
                  disabled={pending}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="retire-merge-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the patient this duplicates…"
                  disabled={pending}
                />
                {searching && (
                  <p className="text-xs text-muted-foreground">Searching…</p>
                )}
                {!searching && hits.length > 0 && (
                  <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {hits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/60"
                          onClick={() => {
                            setMergeTarget(hit)
                            setQuery('')
                            setHits([])
                          }}
                        >
                          {hitLabel(hit)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && query.trim().length >= 2 && hits.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matching patients.</p>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              The retired chart will link here so anyone landing on an old
              bookmark finds the right record.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRetire}
              disabled={pending || !reason.trim()}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retiring…
                </>
              ) : (
                'Retire record'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
