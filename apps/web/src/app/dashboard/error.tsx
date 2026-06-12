'use client'

import { AlertTriangle } from 'lucide-react'

/** Route-segment error boundary: readable message + retry. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-8 py-12">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full text-center space-y-3">
        <AlertTriangle className="h-6 w-6 text-amber-ink mx-auto" />
        <h2 className="text-base font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || 'This page failed to load. Your data is safe — try again.'}
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground font-mono">Ref: {error.digest}</p>
        )}
        <button
          onClick={() => reset()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
