'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const STATION_COLLAPSE_BP = 1024

const SESSION_SPLIT_KEY = 'kh-station-split'
const LIST_PANEL_ID = 'station-list'
const DETAIL_PANEL_ID = 'station-detail'

export type DetailState = 'idle' | 'loading' | 'error' | 'empty'

export type MasterDetailProps = {
  list: ReactNode
  detail: ReactNode
  /** When set, select this id on mount (visit_id). */
  initialSelectionId?: string | null
  selectedId?: string | null
  onSelectedIdChange?: (id: string | null) => void
  detailState?: DetailState
  onDetailRetry?: () => void
  /** Called when user finishes resizing panes (list percentage 0–100). */
  onLayoutResized?: (listPct: number) => void
  listPaneRef?: React.RefObject<HTMLDivElement>
  detailPaneRef?: React.RefObject<HTMLDivElement>
  className?: string
}

function useCollapsedLayout() {
  // Keep SSR + first client paint aligned (false); sync to viewport in useEffect.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(stationCollapseQuery())
    const update = () => setCollapsed(mq.matches)
    update()
    mq.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return collapsed
}

const DEFAULT_LAYOUT = {
  [LIST_PANEL_ID]: 40,
  [DETAIL_PANEL_ID]: 60,
} as const

function normalizeStoredLayout(
  layout: { [LIST_PANEL_ID]: number; [DETAIL_PANEL_ID]: number },
): { [LIST_PANEL_ID]: number; [DETAIL_PANEL_ID]: number } {
  const list = layout[LIST_PANEL_ID]
  const detail = layout[DETAIL_PANEL_ID]
  if (
    typeof list !== 'number' ||
    typeof detail !== 'number' ||
    list < 25 ||
    list > 60 ||
    detail < 35 ||
    detail > 75
  ) {
    return { ...DEFAULT_LAYOUT }
  }
  const total = list + detail
  if (total < 95 || total > 105) {
    return { ...DEFAULT_LAYOUT }
  }
  return layout
}

function readStoredSplit(): { [LIST_PANEL_ID]: number; [DETAIL_PANEL_ID]: number } {
  if (typeof window === 'undefined') return { ...DEFAULT_LAYOUT }
  try {
    const raw = sessionStorage.getItem(SESSION_SPLIT_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw) as Record<string, number>
    if (
      typeof parsed[LIST_PANEL_ID] === 'number' &&
      typeof parsed[DETAIL_PANEL_ID] === 'number'
    ) {
      return normalizeStoredLayout({
        [LIST_PANEL_ID]: parsed[LIST_PANEL_ID],
        [DETAIL_PANEL_ID]: parsed[DETAIL_PANEL_ID],
      })
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LAYOUT }
}

function DetailPaneChrome({
  detailState,
  onDetailRetry,
  detail,
  selectedId,
}: {
  detailState: DetailState
  onDetailRetry?: () => void
  detail: ReactNode
  selectedId?: string | null
}) {
  if (!selectedId || detailState === 'empty') {
    return (
      <div
        className="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
        data-testid="master-detail-empty"
      >
        <p className="text-base font-semibold text-ink">Select a patient from the queue</p>
        <p className="mt-2 max-w-sm text-sm text-body leading-relaxed">
          Quick actions work from the list. Open a row here for full dispense, notes, and chart
          context.
        </p>
      </div>
    )
  }

  if (detailState === 'loading') {
    return (
      <div
        className="flex h-full flex-col gap-3 p-6"
        data-testid="master-detail-loading"
        aria-busy="true"
      >
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-24 w-full animate-pulse rounded-md bg-muted" />
      </div>
    )
  }

  if (detailState === 'error') {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center"
        data-testid="master-detail-error"
      >
        <p className="text-base font-semibold text-ink">Couldn&apos;t load patient</p>
        <p className="text-sm text-body">Check your connection and try again.</p>
        {onDetailRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onDetailRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  return <>{detail}</>
}

/**
 * Two-pane master-detail layout for clinic station workspaces.
 * Collapses to list + sheet below STATION_COLLAPSE_BP.
 */
export function MasterDetail({
  list,
  detail,
  initialSelectionId,
  selectedId,
  onSelectedIdChange,
  detailState = 'idle',
  onDetailRetry,
  onLayoutResized,
  listPaneRef,
  detailPaneRef,
  className,
}: MasterDetailProps) {
  const collapsed = useCollapsedLayout()
  const groupId = useId()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [defaultLayout] = useState(readStoredSplit)

  const hasSelection = Boolean(selectedId ?? initialSelectionId)

  useEffect(() => {
    if (collapsed && selectedId) {
      setSheetOpen(true)
    } else if (!collapsed) {
      setSheetOpen(false)
    }
  }, [collapsed, selectedId])

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_SPLIT_KEY, JSON.stringify(layout))
      }
      const listPct = layout[LIST_PANEL_ID]
      if (typeof listPct === 'number') {
        onLayoutResized?.(listPct)
      }
    },
    [onLayoutResized],
  )

  const detailContent = (
    <DetailPaneChrome
      detailState={detailState}
      onDetailRetry={onDetailRetry}
      detail={detail}
      selectedId={selectedId}
    />
  )

  if (collapsed) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)} data-collapsed="true">
        <div ref={listPaneRef} className="min-h-0 flex-1 overflow-auto">
          {list}
        </div>
        <Sheet open={sheetOpen && hasSelection} onOpenChange={setSheetOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Patient detail</SheetTitle>
            </SheetHeader>
            <div ref={detailPaneRef} className="pt-2">
              {detailContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <div className={cn('min-h-0 w-full flex-1', className)} data-collapsed="false">
      <Group
        id={groupId}
        orientation="horizontal"
        className="flex h-full min-h-0 w-full"
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
      >
        <Panel
          id={LIST_PANEL_ID}
          defaultSize={`${defaultLayout[LIST_PANEL_ID]}%`}
          minSize="320px"
          maxSize="60%"
          className="min-h-0 min-w-0"
        >
          <div ref={listPaneRef} className="h-full min-w-0 overflow-auto">
            {list}
          </div>
        </Panel>
        <Separator className="w-1.5 shrink-0 bg-line-soft hover:bg-cobalt/20 transition-colors data-[separator=active]:bg-cobalt/30" />
        <Panel
          id={DETAIL_PANEL_ID}
          defaultSize={`${defaultLayout[DETAIL_PANEL_ID]}%`}
          minSize="360px"
          className="min-h-0 min-w-0"
        >
          <div
            ref={detailPaneRef}
            className="h-full overflow-auto border-l border-line-soft bg-card"
          >
            {detailContent}
          </div>
        </Panel>
      </Group>
    </div>
  )
}

/** Match media query used for collapse — exposed for tests. */
export function stationCollapseQuery() {
  return `(max-width: ${STATION_COLLAPSE_BP - 1}px)`
}
