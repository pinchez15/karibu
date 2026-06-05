'use client'

import { useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { recordCriticalAlertResponse } from './critical-alert-actions'

export interface VisitCriticalAlert {
  id: string
  rule_slug: string
  confirm_question: string
  clinical_prompt: string
  library_slug: string | null
}

interface VisitCriticalAlertBannerProps {
  alert: VisitCriticalAlert
}

export function VisitCriticalAlertBanner({ alert }: VisitCriticalAlertBannerProps) {
  const [pending, startTransition] = useTransition()

  function respond(response: 'confirmed' | 'data_error' | 'dismissed') {
    startTransition(() => {
      void recordCriticalAlertResponse(alert.id, response)
    })
  }

  return (
    <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-destructive">{alert.confirm_question}</p>
          <p className="text-sm text-body mt-1 leading-relaxed">{alert.clinical_prompt}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond('confirmed')}
          className="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond('data_error')}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          Data error
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond('dismissed')}
          className="text-sm text-muted-foreground underline disabled:opacity-60"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
