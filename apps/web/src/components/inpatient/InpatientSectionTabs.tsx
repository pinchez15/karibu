'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type SectionId = 'active' | 'discharged'

/**
 * B1 — tab switcher between the active ward census and the discharged-patients
 * list. Kept as a thin wrapper so WardCensusClient (active tab) needs zero
 * edits; each tab's content is passed in already rendered/hydrated.
 */
export function InpatientSectionTabs({
  active,
  discharged,
  dischargedCount,
}: {
  active: React.ReactNode
  discharged: React.ReactNode
  dischargedCount: number
}) {
  const [tab, setTab] = useState<SectionId>('active')

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex gap-1 border-b border-border px-6 pt-2">
        <TabButton label="Census" selected={tab === 'active'} onClick={() => setTab('active')} />
        <TabButton
          label="Discharged"
          badge={dischargedCount}
          selected={tab === 'discharged'}
          onClick={() => setTab('discharged')}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className={tab === 'active' ? 'h-full' : 'hidden'}>{active}</div>
        <div className={tab === 'discharged' ? 'h-full' : 'hidden'}>{discharged}</div>
      </div>
    </div>
  )
}

function TabButton({
  label,
  selected,
  onClick,
  badge,
}: {
  label: string
  selected: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        selected ? 'border-cobalt text-cobalt' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  )
}
