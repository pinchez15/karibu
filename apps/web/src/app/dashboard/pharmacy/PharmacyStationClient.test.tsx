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
  captureStationLayoutResized: vi.fn(),
}))

vi.mock('./actions', () => ({
  startPharmacyDispense: vi.fn().mockResolvedValue({ success: true }),
  completePharmacyDispense: vi.fn().mockResolvedValue({ success: true }),
  sendPharmacyBackToClinician: vi.fn().mockResolvedValue({ success: true }),
  listClinicPharmacyStock: vi.fn().mockResolvedValue({ ok: true, items: [] }),
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

  it('renders queue headers and prescription summary', () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="waiting"
        refreshOnUpdate={false}
      />,
    )

    expect(screen.getByText('PATIENT')).toBeInTheDocument()
    expect(screen.getByText('PRESCRIPTIONS')).toBeInTheDocument()
    expect(screen.getAllByText(/Artemether/).length).toBeGreaterThan(0)
  })

  it('auto-selects the first row on load', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="waiting"
        refreshOnUpdate={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('pharmacy-detail-pane')).toHaveTextContent('Amina Okello')
  })

  it('shows per-line worksheet with save & complete', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="waiting"
        refreshOnUpdate={false}
      />,
    )

    expect(screen.getByTestId('save-complete')).toBeInTheDocument()
    expect(screen.getByTestId('rx-line-rx-visit-e2e-001-0')).toBeInTheDocument()
  })

  it('fires PostHog workspace viewed on mount', async () => {
    const { captureStationWorkspaceViewed } = await import('@/lib/station-analytics')

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="waiting"
        refreshOnUpdate={false}
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
        activeTab="waiting"
        refreshOnUpdate={false}
      />,
    )

    const list = screen.getByTestId('pharmacy-queue-list')
    fireEvent.keyDown(list, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
    })
  })
})
