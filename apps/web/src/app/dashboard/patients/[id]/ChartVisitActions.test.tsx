import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PharmacyCatalogDrug } from '@karibu/shared'

// Patient-centric chart actions (Start visit / New script / Order lab). The
// component funnels every path through ensureVisitForChartAction and then
// reuses the visit-scoped panels (VisitPharmacyPanel / VisitLabPanel), so the
// tests mock only the server-action modules and the router.

const ensureMock = vi.fn()
vi.mock('./actions', () => ({
  ensureVisitForChartAction: (...args: unknown[]) => ensureMock(...args),
}))

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))

// VisitPharmacyPanel + VisitLabPanel both import from the visits actions
// module (Clerk / service-role imports that don't run under jsdom).
const submitPharmacyOrderMock = vi.fn().mockResolvedValue({ success: true })
const submitLabOrderMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/app/dashboard/visits/actions', () => ({
  submitPharmacyOrder: (...args: unknown[]) => submitPharmacyOrderMock(...args),
  submitLabOrder: (...args: unknown[]) => submitLabOrderMock(...args),
}))

import { ChartVisitActions } from './ChartVisitActions'

const CATALOG: PharmacyCatalogDrug[] = [
  {
    code: 'AMOX',
    name: 'Amoxicillin',
    strengths: ['250mg', '500mg'],
    category: 'Antibiotics',
  },
]

const CREATED_VISIT = {
  success: true as const,
  visitId: 'visit-new',
  created: true,
  claimed: true,
  pharmacyOrderSubmitted: false,
}

function renderActions(
  overrides: Partial<ComponentProps<typeof ChartVisitActions>> = {},
) {
  return render(
    <ChartVisitActions
      patientId="patient-1"
      staffRole="doctor"
      activeVisit={null}
      prescribingCatalog={CATALOG}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  ensureMock.mockReset().mockResolvedValue(CREATED_VISIT)
  pushMock.mockClear()
  submitPharmacyOrderMock.mockClear()
  submitLabOrderMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('ChartVisitActions — role gating', () => {
  it('shows all three actions to a clinical officer', () => {
    renderActions({ staffRole: 'clinical_officer' })

    expect(screen.getByText('Start visit')).toBeInTheDocument()
    expect(screen.getByText('New script')).toBeInTheDocument()
    expect(screen.getByText('Order lab')).toBeInTheDocument()
  })

  it('shows Start visit but not the ordering actions to a records officer', () => {
    renderActions({ staffRole: 'records_officer' })

    expect(screen.getByText('Start visit')).toBeInTheDocument()
    expect(screen.queryByText('New script')).not.toBeInTheDocument()
    expect(screen.queryByText('Order lab')).not.toBeInTheDocument()
  })

  it('renders nothing for lab/pharmacy station roles', () => {
    renderActions({ staffRole: 'dispenser' })

    expect(screen.queryByText('Start visit')).not.toBeInTheDocument()
    expect(screen.queryByText('New script')).not.toBeInTheDocument()
    expect(screen.queryByText('Order lab')).not.toBeInTheDocument()
  })
})

describe('ChartVisitActions — Start visit', () => {
  it('creates a visit (with an idempotency op id) and navigates to it', async () => {
    renderActions()

    fireEvent.click(screen.getByText('Start visit'))

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/visits/visit-new')
    })
    expect(ensureMock).toHaveBeenCalledWith({
      patient_id: 'patient-1',
      client_op_id: expect.any(String),
    })
  })

  it('offers to open today\'s visit instead of creating a duplicate', () => {
    renderActions({
      activeVisit: {
        id: 'visit-today',
        status: 'pending',
        pharmacy_order_submitted_at: null,
      },
    })

    const button = screen.getByText("Open today's visit")
    expect(screen.queryByText('Start visit')).not.toBeInTheDocument()

    fireEvent.click(button)

    expect(pushMock).toHaveBeenCalledWith('/dashboard/visits/visit-today')
    expect(ensureMock).not.toHaveBeenCalled()
  })

  it('surfaces the server error inline when visit creation fails', async () => {
    ensureMock.mockResolvedValue({ success: false, error: 'Clinic not onboarded yet.' })
    renderActions()

    fireEvent.click(screen.getByText('Start visit'))

    expect(await screen.findByText('Clinic not onboarded yet.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('ChartVisitActions — New script', () => {
  it('ensures a visit then opens structured prescribing for it', async () => {
    renderActions()

    fireEvent.click(screen.getByText('New script'))

    // The reused VisitPharmacyPanel renders once the visit is ready.
    expect(await screen.findByText('Structured prescriptions')).toBeInTheDocument()
    expect(screen.getByText('Send to pharmacy')).toBeInTheDocument()
    expect(ensureMock).toHaveBeenCalledWith({
      patient_id: 'patient-1',
      client_op_id: expect.any(String),
    })
    // Catalog drugs flow through to the composer.
    expect(screen.getByText(/Open the full visit/)).toBeInTheDocument()
  })

  it('shows "Sent to pharmacy" when today\'s reused visit already has an order out', async () => {
    ensureMock.mockResolvedValue({
      success: true,
      visitId: 'visit-today',
      created: false,
      claimed: false,
      pharmacyOrderSubmitted: true,
    })
    renderActions()

    fireEvent.click(screen.getByText('New script'))

    expect(await screen.findByText('Sent to pharmacy')).toBeInTheDocument()
    expect(screen.queryByText('Send to pharmacy')).not.toBeInTheDocument()
  })
})

describe('ChartVisitActions — Order lab', () => {
  it('ensures a visit then submits catalog tests against it', async () => {
    const onOrderSubmitted = vi.fn()
    renderActions({ onOrderSubmitted })

    fireEvent.click(screen.getByText('Order lab'))

    // The reused VisitLabPanel renders the catalog checklist.
    expect(await screen.findByText('Order lab tests')).toBeInTheDocument()

    const checkboxLabel = screen.getByText('Malaria RDT').closest('label')
    const checkbox = checkboxLabel?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    fireEvent.click(checkbox!)
    fireEvent.click(screen.getByText('Send to lab'))

    await waitFor(() => {
      expect(submitLabOrderMock).toHaveBeenCalledWith('visit-new', ['Malaria RDT'])
    })
    // Submitting closes the sheet and refreshes the chart timeline.
    await waitFor(() => {
      expect(onOrderSubmitted).toHaveBeenCalled()
    })
  })

  it('offers a retry inside the sheet when the visit cannot be prepared', async () => {
    ensureMock.mockResolvedValueOnce({ success: false, error: 'Patient not found' })
    renderActions()

    fireEvent.click(screen.getByText('Order lab'))

    expect(await screen.findByText('Patient not found')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Try again'))

    expect(await screen.findByText('Order lab tests')).toBeInTheDocument()
    expect(ensureMock).toHaveBeenCalledTimes(2)
  })
})
