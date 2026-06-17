'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  PrescriptionComposer,
  draftLinesToRpcInput,
  type DraftPrescriptionLine,
} from '@/components/prescription/PrescriptionComposer'
import { submitPharmacyOrder } from '@/app/dashboard/visits/actions'
import type { StaffRole } from '@karibu/shared'

export function VisitPharmacyPanel({
  visitId,
  alreadySubmitted,
  staffRole,
  onSubmitted,
}: {
  visitId: string
  alreadySubmitted: boolean
  staffRole: StaffRole | null
  onSubmitted?: () => void
}) {
  const [drafts, setDrafts] = useState<DraftPrescriptionLine[]>([])
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit =
    !alreadySubmitted &&
    staffRole != null &&
    ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole)

  if (alreadySubmitted) {
    return <p className="text-xs text-green mt-2 font-medium">Sent to pharmacy</p>
  }

  if (!canSubmit) return null

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line-soft bg-muted/30 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Structured prescriptions</p>
        <p className="text-xs text-muted-foreground">
          Add each medication as a separate line before sending to the dispenser queue.
        </p>
      </div>

      <PrescriptionComposer
        disabled={pending}
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
        {pending ? 'Sending…' : 'Send to pharmacy'}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
