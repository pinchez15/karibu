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
  dispensePharmacyLine: vi.fn().mockResolvedValue({ success: true, dispensingStatus: 'partial' }),
  sendPharmacyLineBackToClinician: vi.fn().mockResolvedValue({ success: true }),
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
        activeTab="to_dispense"
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
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByTestId('pharmacy-detail-pane')).toHaveTextContent('Amina Okello')
  })

  it('shows per-line worksheet with dispense button', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="to_dispense"
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
        activeTab="to_dispense"
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
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    const list = screen.getByTestId('pharmacy-queue-list')
    fireEvent.keyDown(list, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
    })
  })

  async function dispenseSelectedLine() {
    const button = await screen.findByTestId('save-complete')
    await userEvent.click(button)
  }

  // PHARM-5: on "To dispense", a visit that becomes `partial` now LEAVES this
  // tab (it moves to the Partial tab) — the old dual-membership kept it here.
  it('removes the visit from "To dispense" when the dispense returns "partial"', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'partial',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(screen.queryByTestId('queue-row-visit-e2e-001')).not.toBeInTheDocument()
    })
    // Selection advances to the next queued visit.
    expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  // Migration 113: finishing med 1 of a multi-line Rx keeps visit in_progress,
  // so the pharmacist can keep dispensing without chasing Partial.
  it('keeps the visit on "To dispense" when mid-session status stays in_progress', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'in_progress',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toBeInTheDocument()
    })
    expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
  })

  // PHARM-5 dispense-remainder flow: on the Partial tab, a still-partial
  // dispense keeps the visit; dispensing the remainder (→ "dispensed") drops it.
  it('keeps a visit on the Partial tab while a balance is still owed', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'partial',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="partial"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(vi.mocked(dispensePharmacyLine)).toHaveBeenCalled()
    })
    expect(screen.getByTestId('queue-row-visit-e2e-001')).toBeInTheDocument()
    expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
  })

  it('removes a visit from the Partial tab when the remainder is dispensed', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'dispensed',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="partial"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(screen.queryByTestId('queue-row-visit-e2e-001')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps a visit listed when the dispense returns "out_of_stock"', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'out_of_stock',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(vi.mocked(dispensePharmacyLine)).toHaveBeenCalled()
    })
    expect(screen.getByTestId('queue-row-visit-e2e-001')).toBeInTheDocument()
    expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
  })

  it('removes the visit and advances selection when the dispense returns "dispensed"', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'dispensed',
    })

    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true')
    })

    await dispenseSelectedLine()

    await waitFor(() => {
      expect(screen.queryByTestId('queue-row-visit-e2e-001')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  // ── PHARM-2 regression: in-progress dispense entries must survive data
  // refreshes. The station receives fresh `initialRows` on every
  // router.refresh() (45s poll, post-dispense refresh, clinic-wide broadcast);
  // the worksheet used to reseed ALL drafts whenever `lines` changed identity,
  // wiping half-typed quantities. Rerendering with cloned rows simulates
  // exactly that prop-identity churn.

  function qtyInputForLine(lineTestId: string): HTMLInputElement {
    const line = screen.getByTestId(lineTestId)
    const input = line.querySelector('input[type="number"]') as HTMLInputElement
    expect(input).not.toBeNull()
    return input
  }

  it('PHARM-2: a background refresh with unchanged data does not wipe a half-typed quantity', async () => {
    const { rerender } = render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await screen.findByTestId('rx-line-rx-visit-e2e-004-1')

    // Pharmacist edits line B mid-dispense (default is 20 from the Rx).
    fireEvent.change(qtyInputForLine('rx-line-rx-visit-e2e-004-1'), { target: { value: '7' } })
    expect(qtyInputForLine('rx-line-rx-visit-e2e-004-1').value).toBe('7')

    // 45s poll / broadcastClinicRefresh delivers identical data with new identity.
    rerender(
      <PharmacyStationClient
        initialRows={structuredClone(PHARMACY_STATION_FIXTURE_ROWS)}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    expect(qtyInputForLine('rx-line-rx-visit-e2e-004-1').value).toBe('7')
  })

  it('PHARM-2: dispensing line A (refresh included) keeps the half-typed entry on line B', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockClear()
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: true,
      dispensingStatus: 'in_progress', // visit stays on "To dispense"
    })

    const { rerender } = render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await screen.findByTestId('rx-line-rx-visit-e2e-004-1')

    // Half-type line B, then dispense line A (first editable line = save-complete).
    fireEvent.change(qtyInputForLine('rx-line-rx-visit-e2e-004-1'), { target: { value: '7' } })
    await userEvent.click(screen.getByTestId('save-complete'))
    await waitFor(() => expect(vi.mocked(dispensePharmacyLine)).toHaveBeenCalled())

    // The refresh lands: line A advanced server-side, line B unchanged.
    const refreshed = structuredClone(PHARMACY_STATION_FIXTURE_ROWS)
    const visit = refreshed.find((r) => r.id === 'visit-e2e-004')!
    visit.dispensing_status = 'in_progress'
    visit.prescription_lines[0] = {
      ...visit.prescription_lines[0],
      status: 'dispensed',
      quantity_dispensed_so_far: 21,
    }
    rerender(
      <PharmacyStationClient
        initialRows={refreshed}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    // Line A is now read-only/dispensed; line B kept the pharmacist's entry.
    expect(screen.getByTestId('rx-line-rx-visit-e2e-004-0')).toHaveTextContent('Dispensed')
    expect(qtyInputForLine('rx-line-rx-visit-e2e-004-1').value).toBe('7')
  })

  it("PHARM-2: a line whose own server state advanced reseeds to the remaining balance", async () => {
    const { rerender } = render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await screen.findByTestId('rx-line-rx-visit-e2e-004-1')
    fireEvent.change(qtyInputForLine('rx-line-rx-visit-e2e-004-1'), { target: { value: '7' } })

    // Server reports line B itself advanced (partial: 12 of 20 dispensed) —
    // the stale draft must be replaced by the PHARM-5 remaining default (8).
    const refreshed = structuredClone(PHARMACY_STATION_FIXTURE_ROWS)
    const visit = refreshed.find((r) => r.id === 'visit-e2e-004')!
    visit.prescription_lines[1] = {
      ...visit.prescription_lines[1],
      status: 'partially_dispensed',
      quantity_dispensed_so_far: 12,
    }
    rerender(
      <PharmacyStationClient
        initialRows={refreshed}
        initialVisitId="visit-e2e-004"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    expect(qtyInputForLine('rx-line-rx-visit-e2e-004-1').value).toBe('8')
  })

  it('PHARM-2: a failed dispense keeps the entered values and the inline error across a refresh', async () => {
    const { dispensePharmacyLine } = await import('./actions')
    vi.mocked(dispensePharmacyLine).mockResolvedValue({
      success: false,
      error: 'Not enough Artemether/Lumefantrine on shelf.',
    })

    const { rerender } = render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        initialVisitId="visit-e2e-001"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await screen.findByTestId('rx-line-rx-visit-e2e-001-0')

    fireEvent.change(qtyInputForLine('rx-line-rx-visit-e2e-001-0'), { target: { value: '5' } })
    await userEvent.click(screen.getByTestId('save-complete'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Not enough Artemether')
    })
    expect(qtyInputForLine('rx-line-rx-visit-e2e-001-0').value).toBe('5')

    // startPharmacyDispense succeeded before the failing line-dispense, so its
    // revalidate/broadcast still triggers a refresh — which must not blank the
    // form or clear the error (this is Javis's "incorrect information" case).
    rerender(
      <PharmacyStationClient
        initialRows={structuredClone(PHARMACY_STATION_FIXTURE_ROWS)}
        initialVisitId="visit-e2e-001"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Not enough Artemether')
    expect(qtyInputForLine('rx-line-rx-visit-e2e-001-0').value).toBe('5')
  })

  it('PHARM-2: switching to a different visit still resets the worksheet', async () => {
    render(
      <PharmacyStationClient
        initialRows={PHARMACY_STATION_FIXTURE_ROWS}
        initialVisitId="visit-e2e-001"
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )
    await screen.findByTestId('rx-line-rx-visit-e2e-001-0')
    fireEvent.change(qtyInputForLine('rx-line-rx-visit-e2e-001-0'), { target: { value: '5' } })

    // Move to visit 2, then back to visit 1 — drafts reseed per visit.
    await userEvent.click(screen.getByTestId('queue-row-visit-e2e-002'))
    await screen.findByTestId('rx-line-rx-visit-e2e-002-0')
    await userEvent.click(screen.getByTestId('queue-row-visit-e2e-001'))
    await screen.findByTestId('rx-line-rx-visit-e2e-001-0')

    expect(qtyInputForLine('rx-line-rx-visit-e2e-001-0').value).toBe('24')
  })

  // WP3 D2: re-opening a partially-dispensed line must default the quantity to
  // the REMAINING amount (prescribed − already dispensed), not the full
  // prescribed amount — otherwise a re-dispense double-bills.
  it('defaults a re-opened partial line to the remaining quantity', async () => {
    const partialRow: (typeof PHARMACY_STATION_FIXTURE_ROWS)[number] = {
      ...PHARMACY_STATION_FIXTURE_ROWS[2],
      id: 'visit-partial-remaining',
      dispensing_status: 'partial',
      patient: { ...PHARMACY_STATION_FIXTURE_ROWS[2].patient, id: 'patient-partial' },
      prescription_lines: [
        {
          ...PHARMACY_STATION_FIXTURE_ROWS[2].prescription_lines[0],
          id: 'rx-partial-remaining-0',
          visit_id: 'visit-partial-remaining',
          status: 'partially_dispensed',
          quantity_prescribed: 10,
          quantity_unit: 'tabs',
          quantity_dispensed_so_far: 4,
        },
      ],
    }

    render(
      <PharmacyStationClient
        initialRows={[partialRow]}
        activeTab="to_dispense"
        refreshOnUpdate={false}
      />,
    )

    const line = await screen.findByTestId('rx-line-rx-partial-remaining-0')
    const qtyInput = line.querySelector('input[type="number"]') as HTMLInputElement
    expect(qtyInput).not.toBeNull()
    expect(qtyInput.value).toBe('6')
    expect(line).toHaveTextContent('already dispensed 4 of 10')
  })
})
