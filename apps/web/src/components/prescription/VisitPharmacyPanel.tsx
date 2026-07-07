'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  PrescriptionComposer,
  draftLinesToRpcInput,
  type DraftPrescriptionLine,
} from '@/components/prescription/PrescriptionComposer'
import { submitPharmacyOrder } from '@/app/dashboard/visits/actions'
import type { PharmacyCatalogDrug, PrescriptionOrderLine } from '@karibu/shared'
import type { StaffRole } from '@karibu/shared'
import { prescriptionLinesToDrafts } from './prescription-line-mappers'

export function VisitPharmacyPanel({
  visitId,
  alreadySubmitted,
  pharmacyReturned,
  dispenseNotes,
  prescriptionLines = [],
  staffRole,
  prescribingCatalog,
  onSubmitted,
}: {
  visitId: string
  alreadySubmitted: boolean
  pharmacyReturned?: boolean
  dispenseNotes?: string | null
  prescriptionLines?: PrescriptionOrderLine[]
  staffRole: StaffRole | null
  prescribingCatalog?: PharmacyCatalogDrug[]
  onSubmitted?: () => void
}) {
  const initialDrafts = pharmacyReturned ? prescriptionLinesToDrafts(prescriptionLines) : []
  const [drafts, setDrafts] = useState<DraftPrescriptionLine[]>(initialDrafts)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit =
    staffRole != null &&
    ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole)

  if (alreadySubmitted && !pharmacyReturned) {
    return <p className="text-xs text-green mt-2 font-medium">Sent to pharmacy</p>
  }

  if (!canSubmit) return null

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line-soft bg-muted/30 p-4">
      {pharmacyReturned && (
        <div className="rounded-xl border border-amber/30 bg-amber-soft p-3 text-sm">
          <p className="text-xs font-semibold text-amber-ink mb-1">Pharmacy returned for clarification</p>
          {dispenseNotes && <p className="whitespace-pre-wrap">{dispenseNotes}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Edit the prescription below and resubmit to pharmacy.
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-foreground">
          {pharmacyReturned ? 'Resubmit prescriptions' : 'Structured prescriptions'}
        </p>
        <p className="text-xs text-muted-foreground">
          Add each medication as a separate line before sending to the dispenser queue.
        </p>
      </div>

      <PrescriptionComposer
        catalog={prescribingCatalog}
        disabled={pending}
        initialLines={initialDrafts.length > 0 ? initialDrafts : undefined}
        onChange={(lines, textSummary) => {
          setDrafts(lines)
          setSummary(textSummary)
        }}
      />

      {summary && (
        <div className="rounded-md border border-line-soft bg-background p-3 text-xs whitespace-pre-wrap text-body">
          {summary}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || draftLinesToRpcInput(drafts).length === 0}
        onClick={() => {
          setError(null)
          const lines = draftLinesToRpcInput(drafts)
          if (lines.length === 0) {
            setError('Add at least one medication line.')
            return
          }
          startTransition(async () => {
            const result = await submitPharmacyOrder(visitId, {
              lines,
              medicationsSummary: summary,
            })
            if (!result.success) {
              setError(result.error)
              return
            }
            onSubmitted?.()
          })
        }}
      >
        {pending ? 'Sending…' : pharmacyReturned ? 'Resubmit to pharmacy' : 'Send to pharmacy'}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
