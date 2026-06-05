'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessagesSquare, Loader2 } from 'lucide-react'
import { startConsultForVisit } from '../../consult/actions'

interface StartConsultButtonProps {
  visitId: string
  disabled?: boolean
}

export function StartConsultButton({ visitId, disabled }: StartConsultButtonProps) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirmStart() {
    setError(null)
    startTransition(async () => {
      const r = await startConsultForVisit(visitId)
      if (!r.success) {
        setError(r.error)
        return
      }
      setShowConfirm(false)
      router.push(`/dashboard/consult/${r.threadId}`)
    })
  }

  if (disabled) return null

  return (
    <div className="space-y-2">
      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-cobalt hover:underline"
        >
          <MessagesSquare className="h-4 w-4" />
          Send to consult
        </button>
      ) : (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-sm">
          <p className="font-medium">Start de-identified consult?</p>
          <p className="text-muted-foreground">
            A redacted clinical summary is shared with the consult model — never the patient&apos;s
            name or phone number. One thread per visit.
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirmStart}
              className="bg-cobalt text-white rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="text-sm text-muted-foreground underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
