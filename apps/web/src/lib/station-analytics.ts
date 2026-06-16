import posthog from 'posthog-js'

type RowSelectSource = 'click' | 'keyboard' | 'auto_advance'

function safeCapture(event: string, props: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try {
    posthog.capture(event, props)
  } catch {
    // PostHog may be unavailable in dev/e2e without keys
  }
}

export function captureStationWorkspaceViewed(props: {
  role: string
  viewport_w: number
  viewport_h: number
  collapsed: boolean
}) {
  safeCapture('station_workspace_viewed', props)
}

export function captureStationRowSelected(props: {
  visit_id: string
  source: RowSelectSource
}) {
  safeCapture('station_row_selected', props)
}

export function captureStationQuickDispense(props: {
  visit_id: string
  action: 'dispensed' | 'partial' | 'out_of_stock'
}) {
  safeCapture('station_quick_dispense', props)
}

export function captureStationDetailDispense(props: { visit_id: string }) {
  safeCapture('station_detail_dispense', props)
}

export function captureStationLayoutResized(props: { list_pct: number }) {
  safeCapture('station_layout_resized', props)
}
