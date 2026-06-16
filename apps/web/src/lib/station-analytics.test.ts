import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  captureStationQuickDispense,
  captureStationRowSelected,
  captureStationWorkspaceViewed,
} from './station-analytics'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}))

describe('station-analytics', () => {
  beforeEach(async () => {
    const posthog = (await import('posthog-js')).default
    vi.mocked(posthog.capture).mockClear()
  })

  it('captures station_workspace_viewed', async () => {
    const posthog = (await import('posthog-js')).default
    captureStationWorkspaceViewed({
      role: 'pharmacy',
      viewport_w: 1366,
      viewport_h: 768,
      collapsed: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith('station_workspace_viewed', {
      role: 'pharmacy',
      viewport_w: 1366,
      viewport_h: 768,
      collapsed: false,
    })
  })

  it('captures station_row_selected with visit_id', async () => {
    const posthog = (await import('posthog-js')).default
    captureStationRowSelected({ visit_id: 'visit-1', source: 'click' })
    expect(posthog.capture).toHaveBeenCalledWith('station_row_selected', {
      visit_id: 'visit-1',
      source: 'click',
    })
  })

  it('captures station_quick_dispense', async () => {
    const posthog = (await import('posthog-js')).default
    captureStationQuickDispense({ visit_id: 'visit-1', action: 'dispensed' })
    expect(posthog.capture).toHaveBeenCalledWith('station_quick_dispense', {
      visit_id: 'visit-1',
      action: 'dispensed',
    })
  })
})
