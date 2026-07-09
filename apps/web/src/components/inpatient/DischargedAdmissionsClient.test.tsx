import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { DischargedAdmissionsClient } from './DischargedAdmissionsClient'
import type { DischargedRow } from '@/app/dashboard/inpatient/types'

const mockLoadDischargedAdmissions = vi.fn()

vi.mock('@/app/dashboard/inpatient/actions', () => ({
  loadDischargedAdmissions: (...args: unknown[]) => mockLoadDischargedAdmissions(...args),
}))

const ROWS: DischargedRow[] = [
  {
    id: 'admission-1',
    patient_id: 'patient-1',
    patient_name: 'Amina Okello',
    date_of_birth: '1990-03-14',
    sex: 'F',
    ward: 'general',
    bed_label: 'B4',
    admission_type: 'general',
    chief_complaint: 'Fever',
    weight_kg: 62,
    admitted_at: '2026-07-01T08:00:00.000Z',
    last_observed_at: '2026-07-04T08:00:00.000Z',
    discharged_at: '2026-07-05T14:00:00.000Z',
    outcome: 'recovered',
    disposition: 'home',
    discharge_notes: 'Completed treatment',
    status: 'discharged',
  },
  {
    id: 'admission-2',
    patient_id: 'patient-2',
    patient_name: 'John Ouma',
    date_of_birth: '1985-01-01',
    sex: 'M',
    ward: 'general',
    bed_label: null,
    admission_type: 'general',
    chief_complaint: 'Trauma',
    weight_kg: null,
    admitted_at: '2026-07-02T08:00:00.000Z',
    last_observed_at: null,
    discharged_at: '2026-07-06T09:00:00.000Z',
    outcome: 'referred',
    disposition: 'referred',
    discharge_notes: null,
    status: 'transferred',
  },
]

describe('DischargedAdmissionsClient', () => {
  afterEach(() => {
    cleanup()
    mockLoadDischargedAdmissions.mockReset()
  })

  it('renders discharged rows with outcome, status, and a print link per row', () => {
    render(
      <DischargedAdmissionsClient
        clinicId="clinic-1"
        initialRows={ROWS}
        initialFrom="2026-06-06"
        initialTo="2026-07-06"
      />,
    )

    expect(screen.getByText('Amina Okello')).toBeInTheDocument()
    expect(screen.getByText('recovered')).toBeInTheDocument()
    expect(screen.getByText('John Ouma')).toBeInTheDocument()
    expect(screen.getByText('Transferred')).toBeInTheDocument()

    const printLinks = screen.getAllByTitle('Print discharge summary')
    expect(printLinks).toHaveLength(2)
    expect(printLinks[0]).toHaveAttribute('href', '/dashboard/inpatient/admission-1/print')
  })

  it('shows the empty state when no discharges are in range', () => {
    render(
      <DischargedAdmissionsClient
        clinicId="clinic-1"
        initialRows={[]}
        initialFrom="2026-06-06"
        initialTo="2026-07-06"
      />,
    )
    expect(screen.getByText('No discharges in this range.')).toBeInTheDocument()
  })

  it('refetches with the clinic id, date range, and outcome filter on Apply', async () => {
    mockLoadDischargedAdmissions.mockResolvedValue([])

    render(
      <DischargedAdmissionsClient
        clinicId="clinic-1"
        initialRows={ROWS}
        initialFrom="2026-06-06"
        initialTo="2026-07-06"
      />,
    )

    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'recovered' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(mockLoadDischargedAdmissions).toHaveBeenCalledWith('clinic-1', '2026-06-06', '2026-07-06', 'recovered')
    })
  })

  it('applies a date preset and refetches immediately', async () => {
    mockLoadDischargedAdmissions.mockResolvedValue(ROWS)

    render(
      <DischargedAdmissionsClient
        clinicId="clinic-1"
        initialRows={ROWS}
        initialFrom="2026-06-06"
        initialTo="2026-07-06"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))

    await waitFor(() => {
      expect(mockLoadDischargedAdmissions).toHaveBeenCalledTimes(1)
    })
    expect(mockLoadDischargedAdmissions.mock.calls[0][0]).toBe('clinic-1')
    expect(mockLoadDischargedAdmissions.mock.calls[0][3]).toBe('all')
  })
})
