'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ReviewNotesList } from './ReviewNotesList'
import { ReviewVisitPanel } from './ReviewVisitPanel'
import type { ReviewNotesVisit, UncodedVisitRow } from '@/lib/review-notes'
import type { ReviewVisitKind } from './load-visit'
import { loadReviewVisitPanel } from './load-visit'
import type { StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

/** Match Tailwind `lg` — below this width we use a Sheet; at/above we use inline panel. */
const NARROW_QUERY = '(max-width: 1023px)'

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return narrow
}

export type ReviewQueueItem = {
  visitId: string
  kind: ReviewVisitKind
  patientName: string | null
  patientNumber: number | null
  visitDate: string
  doctorName?: string | null
  tags: string[]
}

function buildQueue(
  unfinalized: ReviewNotesVisit[],
  uncoded: UncodedVisitRow[],
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = unfinalized.map((r) => {
    const tags: string[] = []
    if (!r.has_diagnosis) tags.push('no diagnosis')
    if (r.missing_age) tags.push('no age')
    if (r.missing_sex) tags.push('no sex')
    if (tags.length === 0) tags.push('unsigned')
    return {
      visitId: r.visit_id,
      kind: 'unfinalized',
      patientName: r.patient_name,
      patientNumber: r.patient_number,
      visitDate: r.visit_date,
      doctorName: r.doctor_name,
      tags,
    }
  })
  for (const r of uncoded) {
    items.push({
      visitId: r.visit_id,
      kind: 'uncoded',
      patientName: r.patient_name,
      patientNumber: null,
      visitDate: r.visit_date,
      tags: ['no HMIS code'],
    })
  }
  return items
}

export function ReviewNotesWorkspace({
  initialUnfinalized,
  initialUncoded,
  periodLabel,
  staffRole,
}: {
  initialUnfinalized: ReviewNotesVisit[]
  initialUncoded: UncodedVisitRow[]
  periodLabel: string
  staffRole: StaffRole
}) {
  const [unfinalized, setUnfinalized] = useState(initialUnfinalized)
  const [uncoded, setUncoded] = useState(initialUncoded)
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const narrow = useNarrowViewport()

  useEffect(() => {
    if (!narrow) setMobileSheetOpen(false)
  }, [narrow])

  const queue = useMemo(() => buildQueue(unfinalized, uncoded), [unfinalized, uncoded])

  const selected = queue.find((q) => q.visitId === selectedVisitId) ?? null
  const selectedIndex = selected ? queue.findIndex((q) => q.visitId === selected.visitId) : -1

  const openVisit = useCallback((visitId: string) => {
    setSelectedVisitId(visitId)
    if (window.matchMedia(NARROW_QUERY).matches) {
      setMobileSheetOpen(true)
    }
  }, [])

  const closePanel = useCallback(() => {
    setSelectedVisitId(null)
    setMobileSheetOpen(false)
  }, [])

  const advanceAfterResolved = useCallback(
    (visitId: string, kind: ReviewVisitKind) => {
      if (kind === 'unfinalized') {
        setUnfinalized((prev) => prev.filter((r) => r.visit_id !== visitId))
      } else {
        setUncoded((prev) => prev.filter((r) => r.visit_id !== visitId))
      }

      const remaining = queue.filter((q) => q.visitId !== visitId)
      const next = remaining[0]
      if (next) {
        setSelectedVisitId(next.visitId)
      } else {
        closePanel()
      }
    },
    [queue, closePanel],
  )

  const handleResolved = useCallback(() => {
    if (!selected) return
    advanceAfterResolved(selected.visitId, selected.kind)
  }, [selected, advanceAfterResolved])

  const handleDemographicsUpdated = useCallback(async (visitId: string) => {
    const result = await loadReviewVisitPanel(visitId)
    if (!result.data) return
    const p = result.data.patient
    setUnfinalized((prev) =>
      prev.map((r) =>
        r.visit_id === visitId
          ? {
              ...r,
              missing_sex: p.sex == null,
              missing_age: p.dob_precision === 'unknown',
              has_diagnosis: !!(result.data!.diagnosis?.trim()),
            }
          : r,
      ),
    )
  }, [])

  const panel =
    selected ? (
      <ReviewVisitPanel
        key={selected.visitId}
        visitId={selected.visitId}
        kind={selected.kind}
        staffRole={staffRole}
        positionLabel={
          selectedIndex >= 0
            ? `${selectedIndex + 1} of ${queue.length}`
            : undefined
        }
        onClose={closePanel}
        onResolved={handleResolved}
        onDemographicsUpdated={() => handleDemographicsUpdated(selected.visitId)}
        focusTags={selected.tags}
      />
    ) : null

  return (
    <div className={cn('flex min-h-0 flex-1', narrow ? 'flex-col' : 'flex-row')}>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto px-8 py-6',
          selected && !narrow && 'max-w-[min(100%,52%)] border-r border-border',
        )}
      >
        <ReviewNotesList
          unfinalized={unfinalized}
          uncoded={uncoded}
          periodLabel={periodLabel}
          selectedVisitId={selectedVisitId}
          onSelectVisit={openVisit}
        />
      </div>

      {/* Desktop: inline right panel — no modal overlay */}
      {selected && !narrow && (
        <aside
          className="flex h-full min-h-0 w-[min(520px,48vw)] shrink-0 flex-col overflow-hidden border-l border-border shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.08)] animate-in slide-in-from-right-4 duration-200"
        >
          {panel}
        </aside>
      )}

      {/* Narrow viewports only — Sheet mounts its own overlay */}
      {narrow && (
        <Sheet open={mobileSheetOpen && !!selected} onOpenChange={(open) => !open && closePanel()}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 sm:max-w-lg md:max-w-xl"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Review visit</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
