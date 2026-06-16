import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { PharmacyStationClient } from './PharmacyStationClient'
import { PHARMACY_STATION_FIXTURE_ROWS } from './pharmacy-fixtures'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('@/lib/station-analytics', () => ({
  captureStationWorkspaceViewed: vi.fn(),
  captureStationRowSelected: vi.fn(),
  captureStationQuickDispense: vi.fn(),
  captureStationLayoutResized: vi.fn(),
}))

vi.mock('./dispense-with-stock-dialog', () => ({
  DispenseWithStockDialog: () => null,
}))

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('1023px') ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('PharmacyStationClient', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockMatchMedia(false)
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders queue headers and inline quick-action buttons', () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={async () => ({ success: true })}
      />,
    )

    expect(screen.getByText('PATIENT')).toBeInTheDocument()
    expect(screen.getByText('ACTIONS')).toBeInTheDocument()
    expect(screen.getAllByTestId('quick-mark').length).toBeGreaterThan(0)
  })

  it('auto-selects the first row on load', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={async () => ({ success: true })}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('pharmacy-detail-pane')).toHaveTextContent('Amina Okello')
  })

  it('quick mark removes row and auto-advances selection', async () => {
    const user = userEvent.setup()
    const dispense = vi.fn().mockResolvedValue({ success: true })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={dispense}
      />,
    )

    const firstRow = screen.getByTestId('queue-row-visit-e2e-001')
    await user.click(firstRow.querySelector('[data-testid="quick-mark"]')!)

    await waitFor(() => {
      expect(dispense).toHaveBeenCalledWith('visit-e2e-001', 'dispensed', undefined)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('queue-row-visit-e2e-001')).not.toBeInTheDocument()
      expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('surfaces list error banner when quick mark fails', async () => {
    const user = userEvent.setup()

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={async () => ({ success: false, error: 'Network error' })}
      />,
    )

    await user.click(screen.getByTestId('queue-row-visit-e2e-001').querySelector('[data-testid="quick-mark"]')!)

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })
  })

  it('fires PostHog workspace viewed on mount', async () => {
    const { captureStationWorkspaceViewed } = await import('@/lib/station-analytics')

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={async () => ({ success: true })}
      />,
    )

    await waitFor(() => {
      expect(captureStationWorkspaceViewed).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'pharmacy' }),
      )
    })
  })

  it('selects row on keyboard ArrowDown', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        refreshOnUpdate={false}
        setDispensingStatusFn={async () => ({ success: true })}
      />,
    )

    const list = screen.getByTestId('pharmacy-queue-list')
    fireEvent.keyDown(list, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
    })
  })
})
