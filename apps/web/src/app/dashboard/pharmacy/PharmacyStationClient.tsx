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
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Package,
  PackageX,
} from 'lucide-react'
import { MasterDetail, STATION_COLLAPSE_BP } from '@/components/master-detail'
import { cn } from '@/lib/utils'
import {
  captureStationLayoutResized,
  captureStationQuickDispense,
  captureStationRowSelected,
  captureStationWorkspaceViewed,
} from '@/lib/station-analytics'
import { setDispensingStatus as defaultSetDispensingStatus } from './actions'
import { DispenseWithStockDialog } from './dispense-with-stock-dialog'
import {
  type DispensingRow,
  patientDisplayName,
  patientMeta,
  StatusPill,
} from './pharmacy-shared'

type SelectSource = 'click' | 'keyboard' | 'auto_advance'

type DispenseStatusFn = typeof defaultSetDispensingStatus

export function PharmacyStationClient({
  initialRows,
  initialVisitId = null,
  setDispensingStatusFn,
  refreshOnUpdate = true,
}: {
  initialRows: DispensingRow[]
  initialVisitId?: string | null
  /** Inject mock for tests / e2e fixture (defaults to server action). */
  setDispensingStatusFn?: DispenseStatusFn
  /** When false, skip router.refresh after optimistic queue updates. */
  refreshOnUpdate?: boolean
}) {
  const dispenseStatus = setDispensingStatusFn ?? defaultSetDispensingStatus
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialVisitId && initialRows.some((r) => r.id === initialVisitId)) {
      return initialVisitId
    }
    return initialRows[0]?.id ?? null
  })
  const [listError, setListError] = useState<string | null>(null)
  const [detailNotes, setDetailNotes] = useState('')
  const [showDispenseDialog, setShowDispenseDialog] = useState(false)
  const listPaneRef = useRef<HTMLDivElement>(null)
  const detailPaneRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const instrumented = useRef(false)
  const syncedInitialRowsRef = useRef(initialRows)

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const pickInitialSelection = useCallback(
    (nextRows: DispensingRow[]) => {
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
    if (selectedRow) {
      setDetailNotes(selectedRow.dispense_notes ?? '')
    }
  }, [selectedRow?.id, selectedRow?.dispense_notes])

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

  const applyRowUpdate = useCallback(
    (
      visitId: string,
      patch: Partial<DispensingRow>,
      options?: { remove?: boolean },
    ) => {
      setRows((prev) => {
        if (options?.remove) {
          const next = prev.filter((r) => r.id !== visitId)
          const idx = prev.findIndex((r) => r.id === visitId)
          const newIdx = idx >= 0 && idx < next.length ? idx : 0
          const nextId = next[newIdx]?.id ?? next[0]?.id ?? null
          setSelectedId(nextId)
          if (nextId) {
            captureStationRowSelected({ visit_id: nextId, source: 'auto_advance' })
          }
          return next
        }
        return prev.map((r) => (r.id === visitId ? { ...r, ...patch } : r))
      })
      if (refreshOnUpdate) {
        router.refresh()
      }
    },
    [refreshOnUpdate, router],
  )

  const handleQuickDispense = useCallback(
    async (
      visitId: string,
      status: 'dispensed' | 'partial' | 'out_of_stock',
      notes?: string,
    ) => {
      setListError(null)
      const result = await dispenseStatus(visitId, status, notes)
      if (!result.success) {
        setListError(result.error)
        return
      }
      captureStationQuickDispense({ visit_id: visitId, action: status })
      if (status === 'dispensed') {
        applyRowUpdate(visitId, {}, { remove: true })
      } else {
        applyRowUpdate(visitId, {
          dispensing_status: status,
          dispense_notes: notes?.trim() ? notes.trim() : null,
        })
      }
    },
    [applyRowUpdate, dispenseStatus],
  )

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    const idx = rows.findIndex((r) => r.id === selectedId)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = rows[Math.min(idx < 0 ? 0 : idx + 1, rows.length - 1)]
      if (next) selectRow(next.id, 'keyboard')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = rows[Math.max(idx <= 0 ? 0 : idx - 1, 0)]
      if (next) selectRow(next.id, 'keyboard')
    } else if (event.key === 'Enter' && selectedId) {
      event.preventDefault()
      const focusable = detailPaneRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    }
  }

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectedId) return
      const active = document.activeElement
      if (detailPaneRef.current?.contains(active)) {
        event.preventDefault()
        const rowEl = rowRefs.current.get(selectedId)
        rowEl?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const list = (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={handleListKeyDown}
      data-testid="pharmacy-queue-list"
    >
      {listError && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-[18px] py-3 text-sm text-destructive">
          Couldn&apos;t refresh queue. {listError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setListError(null)
              router.refresh()
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="sticky top-0 z-10 border-b border-line-soft bg-background px-[18px] py-2">
        <div className="grid grid-cols-[1.4fr_1fr_2fr_0.9fr_1.4fr] gap-3 kh-meta">
          <span>PATIENT</span>
          <span>DIAGNOSIS</span>
          <span>MEDICATIONS</span>
          <span>STATUS</span>
          <span>ACTIONS</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {rows.map((row, i) => (
          <PharmacyQueueRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            last={i === rows.length - 1}
            notes={row.id === selectedId ? detailNotes : row.dispense_notes ?? ''}
            onSelect={() => selectRow(row.id, 'click')}
            onQuickDispense={handleQuickDispense}
            onOpenDispenseDialog={() => {
              selectRow(row.id, 'click')
              setShowDispenseDialog(true)
            }}
            rowRef={(el) => {
              if (el) rowRefs.current.set(row.id, el)
              else rowRefs.current.delete(row.id)
            }}
          />
        ))}
      </div>
    </div>
  )

  const detail = selectedRow ? (
    <PharmacyDetailPane
      row={selectedRow}
      notes={detailNotes}
      onNotesChange={setDetailNotes}
      onOpenDispense={() => setShowDispenseDialog(true)}
      onQuickDispense={handleQuickDispense}
    />
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

      {showDispenseDialog && selectedRow && (
        <DispenseWithStockDialog
          visitId={selectedRow.id}
          medicationsText={selectedRow.medications ?? ''}
          initialNotes={detailNotes}
          onClose={() => setShowDispenseDialog(false)}
          onSuccess={(status) => {
            if (status === 'dispensed') {
              applyRowUpdate(selectedRow.id, {}, { remove: true })
            } else {
              applyRowUpdate(selectedRow.id, {
                dispensing_status: status,
              })
            }
          }}
        />
      )}
    </div>
  )
}

function PharmacyQueueRow({
  row,
  selected,
  last,
  notes,
  onSelect,
  onQuickDispense,
  onOpenDispenseDialog,
  rowRef,
}: {
  row: DispensingRow
  selected: boolean
  last: boolean
  notes: string
  onSelect: () => void
  onQuickDispense: (
    visitId: string,
    status: 'dispensed' | 'partial' | 'out_of_stock',
    notes?: string,
  ) => Promise<void>
  onOpenDispenseDialog: () => void
  rowRef: (el: HTMLDivElement | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function dispatch(status: 'dispensed' | 'partial' | 'out_of_stock') {
    setError(null)
    setPending(true)
    void onQuickDispense(row.id, status, notes || undefined)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Dispense failed')
      })
      .finally(() => setPending(false))
  }

  return (
    <div
      ref={rowRef}
      role="row"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      data-testid={`queue-row-${row.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[1.4fr_1fr_2fr_0.9fr_1.4fr] items-start gap-3 px-[18px] py-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40',
        !last && 'border-b border-line-soft',
        selected && 'border-l-[3px] border-l-cobalt bg-cobalt-soft',
        pending && 'opacity-60',
      )}
    >
      <div>
        <div className="font-semibold">{patientDisplayName(row)}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{patientMeta(row)}</div>
      </div>
      <div className="text-body">{row.diagnosis || row.chief_complaint || '—'}</div>
      <div className="whitespace-pre-wrap leading-relaxed text-body">
        {row.medications || '—'}
      </div>
      <div>
        <StatusPill status={row.dispensing_status} />
      </div>
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenDispenseDialog}
            disabled={pending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-green px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Package className="h-3 w-3" />
            )}
            Dispense + stock
          </button>
          <button
            type="button"
            onClick={() => dispatch('dispensed')}
            disabled={pending}
            data-testid="quick-mark"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-green/30 bg-green-soft px-2.5 py-1.5 text-xs font-semibold text-green disabled:opacity-50"
            title="Mark dispensed without recording stock movements"
          >
            <Check className="h-3 w-3" /> Quick mark
          </button>
          <button
            type="button"
            onClick={() => dispatch('partial')}
            disabled={pending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-amber/30 bg-amber-soft px-2.5 py-1.5 text-xs font-semibold text-amber-ink disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" /> Partial
          </button>
          <button
            type="button"
            onClick={() => dispatch('out_of_stock')}
            disabled={pending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-red/30 bg-red-soft px-2.5 py-1.5 text-xs font-semibold text-red disabled:opacity-50"
          >
            <PackageX className="h-3 w-3" /> Out
          </button>
        </div>
        {error && <div className="text-[11px] text-destructive">{error}</div>}
      </div>
    </div>
  )
}

function PharmacyDetailPane({
  row,
  notes,
  onNotesChange,
  onOpenDispense,
  onQuickDispense,
}: {
  row: DispensingRow
  notes: string
  onNotesChange: (value: string) => void
  onOpenDispense: () => void
  onQuickDispense: (
    visitId: string,
    status: 'dispensed' | 'partial' | 'out_of_stock',
    notes?: string,
  ) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const name = patientDisplayName(row)
  const isPartial =
    row.dispensing_status === 'partial' || row.dispensing_status === 'out_of_stock'

  return (
    <div className="flex h-full flex-col p-6" data-testid="pharmacy-detail-pane">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{name}</h2>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{patientMeta(row)}</p>
        </div>
        <Link
          href={`/dashboard/patients/${row.patient.id}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-cobalt hover:underline"
        >
          Open chart
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="kh-meta">DIAGNOSIS</div>
          <p className="mt-1 text-sm text-body">
            {row.diagnosis || row.chief_complaint || '—'}
          </p>
        </div>

        <div>
          <div className="kh-meta">MEDICATIONS</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-body">
            {row.medications || '—'}
          </p>
        </div>

        <div>
          <div className="kh-meta">STATUS</div>
          <div className="mt-1">
            <StatusPill status={row.dispensing_status} />
          </div>
        </div>

        {isPartial && (
          <div className="rounded-md border border-amber/30 bg-amber-soft/50 px-3 py-2 text-sm text-amber-ink">
            Partially dispensed — review notes before closing this visit.
          </div>
        )}

        <div>
          <label htmlFor={`dispense-notes-${row.id}`} className="kh-meta">
            DISPENSE NOTE
          </label>
          <textarea
            id={`dispense-notes-${row.id}`}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="e.g. Substituted Co-trimoxazole for Amoxicillin (out of stock)"
            rows={4}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">
        <button
          type="button"
          onClick={onOpenDispense}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Package className="h-4 w-4" />
          Dispense + stock
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true)
            void onQuickDispense(row.id, 'dispensed', notes || undefined).finally(() =>
              setPending(false),
            )
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-green/30 bg-green-soft px-4 py-2 text-sm font-semibold text-green disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Quick mark dispensed
        </button>
      </div>
    </div>
  )
}
