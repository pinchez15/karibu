'use client'

import Link from 'next/link'
import { Archive } from 'lucide-react'

export type MergedIntoSummary = {
  id: string
  name: string
}

/**
 * Shown at the top of a retired patient's chart (migration 111 soft-retire).
 * Old links keep working — the chart renders read-only history under this
 * banner instead of 404ing — and when the retire recorded a surviving record
 * we link straight to it.
 */
export function RetiredPatientBanner({
  retiredAt,
  reason,
  mergedInto,
}: {
  retiredAt: string
  reason: string | null
  mergedInto: MergedIntoSummary | null
}) {
  const dateLabel = (() => {
    const d = new Date(retiredAt)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  })()

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <div className="flex items-start gap-2.5">
        <Archive className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">
            This record was retired{dateLabel ? ` on ${dateLabel}` : ''} (duplicate
            registration).
          </p>
          {reason && <p className="mt-0.5">{reason}</p>}
          {mergedInto ? (
            <p className="mt-1">
              See the surviving record:{' '}
              <Link
                href={`/dashboard/patients/${mergedInto.id}`}
                className="font-medium underline underline-offset-2"
              >
                {mergedInto.name}
              </Link>
            </p>
          ) : (
            <p className="mt-1">
              Past visits and notes below are kept for reference; new activity is
              disabled on this record.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
