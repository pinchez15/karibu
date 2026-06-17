'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { PharmacyQueueTab } from '@karibu/shared'

const TAB_LABELS: Record<PharmacyQueueTab, string> = {
  waiting: 'Waiting',
  in_progress: 'In progress',
  done_today: 'Done today',
}

export function PharmacyTabs({
  active,
  counts,
}: {
  active: PharmacyQueueTab
  counts: Record<PharmacyQueueTab, number>
}) {
  const pathname = usePathname() ?? '/dashboard/pharmacy'
  const searchParams = useSearchParams()

  function hrefFor(tab: PharmacyQueueTab): string {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', tab)
    const q = params.toString()
    return q ? `${pathname}?${q}` : pathname
  }

  return (
    <div
      className="mb-4 flex flex-wrap gap-2 border-b border-line-soft pb-3"
      data-testid="pharmacy-tabs"
    >
      {(Object.keys(TAB_LABELS) as PharmacyQueueTab[]).map((tab) => (
        <Link
          key={tab}
          href={hrefFor(tab)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            active === tab
              ? 'bg-cobalt text-white'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted',
          )}
          data-testid={`pharmacy-tab-${tab}`}
        >
          {TAB_LABELS[tab]} ({counts[tab]})
        </Link>
      ))}
    </div>
  )
}
