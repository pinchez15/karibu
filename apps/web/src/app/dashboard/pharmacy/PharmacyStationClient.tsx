'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Search, X } from 'lucide-react'
import { filterQueueBySearch, prescriptionLineDisplayName } from '@karibu/shared'
import { MasterDetail, STATION_COLLAPSE_BP } from '@/components/master-detail'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { cn } from '@/lib/utils'
import {
  captureStationLayoutResized,
  captureStationRowSelected,
  captureStationWorkspaceViewed,
} from '@/lib/station-analytics'
import type { PharmacyQueueTab } from '@karibu/shared'
import { PrescriptionWorksheet, type DispenseCompletionResult } from './PrescriptionWorksheet'
import type { PharmacyStationRow } from './pharmacy-data'
import { patientDisplayName, patientMeta, StatusPill } from './pharmacy-shared'

type SelectSource = 'click' | 'keyboard' | 'auto_advance'

function rxListSummary(row: PharmacyStationRow): string {
  if (row.prescription_lines.length > 0) {
    return row.prescription_lines
      .slice(0, 2)
      .map((line, i) => `${i + 1}. ${prescriptionLineDisplayName(line)}`)
      .join(' · ')
  }
  return row.medications?.split('\n')[0]?.trim() ?? '—'
}

export function PharmacyStationClient({
  initialRows,
  initialVisitId = null,
  activeTab,
  refreshOnUpdate = true,
  completeDispenseFn,
  startDispenseFn,
}: {
  initialRows: PharmacyStationRow[]
  initialVisitId?: string | null
  activeTab: PharmacyQueueTab
  refreshOnUpdate?: boolean
  completeDispenseFn?: typeof import('./actions').dispensePharmacyLine
  startDispenseFn?: typeof import('./actions').startPharmacyDispense
}) {
  const router = useRouter()
  useAutoRefresh()
  const [rows, setRows] = useState(initialRows)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialVisitId && initialRows.some((r) => r.id === initialVisitId)) {
      return initialVisitId
    }
    return initialRows[0]?.id ?? null
  })
  const listPaneRef = useRef<HTMLDivElement>(null)
  const detailPaneRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const instrumented = useRef(false)
  const syncedInitialRowsRef = useRef(initialRows)

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  // WP2 D9: client-side type-ahead over rows already in memory (≤100). Matches
  // patient name, today's number, or patient number.
  const visibleRows = useMemo(
    () =>
      filterQueueBySearch(rows, search, (r) => ({
        name: patientDisplayName(r),
        todayNumber: r.queue_position,
        extra: [r.patient.patient_number],
      })),
    [rows, search],
  )

  const readOnly = activeTab === 'done_today'

  const pickInitialSelection = useCallback(
    (nextRows: PharmacyStationRow[]) => {
      if (nextRows.length === 0) return null
      if (initialVisitId && nextRows.some((r) => r.id === initialVisitId)) {
        return initialVisitId
      }
      return nextRows[0].id
    },
    [initialVisitId],
  )

  useEffect(() => {
    if (syncedInitialRowsRef.current === initialRows) return
    syncedInitialRowsRef.current = initialRows
    setRows(initialRows)
    setSelectedId((prev) => {
      if (prev && initialRows.some((r) => r.id === prev)) return prev
      return pickInitialSelection(initialRows)
    })
  }, [initialRows, pickInitialSelection])

  useEffect(() => {
    if (instrumented.current || typeof window === 'undefined') return
    instrumented.current = true
    captureStationWorkspaceViewed({
      role: 'pharmacy',
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      collapsed: window.innerWidth < STATION_COLLAPSE_BP,
    })
  }, [])

  const selectRow = useCallback((id: string, source: SelectSource) => {
    setSelectedId(id)
    captureStationRowSelected({ visit_id: id, source })
  }, [])

  const removeRow = useCallback(
    (visitId: string) => {
      setRows((prev) => {
        const next = prev.filter((r) => r.id !== visitId)
        const idx = prev.findIndex((r) => r.id === visitId)
        const newIdx = idx >= 0 && idx < next.length ? idx : 0
        const nextId = next[newIdx]?.id ?? next[0]?.id ?? null
        setSelectedId(nextId)
        if (nextId) captureStationRowSelected({ visit_id: nextId, source: 'auto_advance' })
        return next
      })
      if (refreshOnUpdate) router.refresh()
    },
    [refreshOnUpdate, router],
  )

  const handleDispenseCompleted = useCallback(
    (visitId: string, result: DispenseCompletionResult) => {
      // WP1 D2: only a fully dispensed visit leaves the "To dispense" tab. A
      // partial or out-of-stock visit still needs pharmacist action, so it
      // stays listed (with its status chip) and keeps its selection — this is
      // the fix for scripts "disappearing" mid-work.
      if (result.dispensingStatus === 'dispensed') {
        removeRow(visitId)
        return
      }
      if (refreshOnUpdate) router.refresh()
    },
    [refreshOnUpdate, router, removeRow],
  )

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (visibleRows.length === 0) return
    const idx = visibleRows.findIndex((r) => r.id === selectedId)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = visibleRows[Math.min(idx < 0 ? 0 : idx + 1, visibleRows.length - 1)]
      if (next) selectRow(next.id, 'keyboard')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = visibleRows[Math.max(idx <= 0 ? 0 : idx - 1, 0)]
      if (next) selectRow(next.id, 'keyboard')
    }
  }

  const list = (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={handleListKeyDown}
      data-testid="pharmacy-queue-list"
    >
      <div className="sticky top-0 z-10 space-y-2 border-b border-line-soft bg-background px-[18px] py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or #"
            aria-label="Filter by patient name or today's number"
            data-testid="pharmacy-queue-search"
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="grid grid-cols-[0.4fr_1.2fr_0.9fr_1.8fr_0.8fr] gap-3 kh-meta">
          <span>#</span>
          <span>PATIENT</span>
          <span>DIAGNOSIS</span>
          <span>PRESCRIPTIONS</span>
          <span>STATUS</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {visibleRows.length === 0 ? (
          <div className="px-[18px] py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'Nothing to dispense.' : `No patients match “${search}”.`}
          </div>
        ) : (
          visibleRows.map((row, i) => (
            <div
              key={row.id}
              ref={(el) => {
                if (el) rowRefs.current.set(row.id, el)
                else rowRefs.current.delete(row.id)
              }}
              role="button"
              tabIndex={0}
              data-testid={`queue-row-${row.id}`}
              aria-selected={row.id === selectedId}
              className={cn(
                'grid cursor-pointer grid-cols-[0.4fr_1.2fr_0.9fr_1.8fr_0.8fr] items-center gap-3 border-b border-line-soft px-[18px] py-3 text-sm transition-colors',
                row.id === selectedId ? 'bg-cobalt-soft/40' : 'hover:bg-muted/40',
                i === visibleRows.length - 1 && 'border-b-0',
              )}
              onClick={() => selectRow(row.id, 'click')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  selectRow(row.id, 'click')
                }
              }}
            >
              <div className="font-mono text-[15px] font-semibold tabular-nums">
                {row.queue_position ?? '—'}
              </div>
              <div>
                <p className="font-medium text-foreground">{patientDisplayName(row)}</p>
                <p className="text-xs text-muted-foreground">{patientMeta(row)}</p>
              </div>
              <p className="truncate text-body">{row.diagnosis ?? '—'}</p>
              <p className="truncate text-body">{rxListSummary(row)}</p>
              <StatusPill status={row.dispensing_status} />
            </div>
          ))
        )}
      </div>
    </div>
  )

  const detail = selectedRow ? (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-4 py-2">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label="Close patient detail"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
        <div className="flex items-center gap-4">
          <a
            href={`/dashboard/pharmacy/${selectedRow.id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
          >
            Print receipt
          </a>
          <Link
            href={`/dashboard/visits/${selectedRow.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
          >
            Open chart
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <PrescriptionWorksheet
        row={selectedRow}
        readOnly={readOnly}
        dispenseLineFn={completeDispenseFn}
        startDispenseFn={startDispenseFn}
        onUpdated={() => {
          if (refreshOnUpdate) router.refresh()
        }}
        onCompleted={(result) => handleDispenseCompleted(selectedRow.id, result)}
      />
    </div>
  ) : null

  return (
    <div data-testid="pharmacy-station-workspace" className="flex min-h-0 flex-1 flex-col">
      <MasterDetail
        className="h-full min-h-[480px]"
        list={list}
        detail={detail}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        initialSelectionId={initialVisitId}
        detailState={selectedId ? 'idle' : 'empty'}
        listPaneRef={listPaneRef}
        detailPaneRef={detailPaneRef}
        onLayoutResized={(listPct) => captureStationLayoutResized({ list_pct: listPct })}
      />
    </div>
  )
}
