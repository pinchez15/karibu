import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PatientWithDerivedAge } from './actions'

// The "Retire duplicate record…" entry point lives inside the Edit sheet, as
// a deliberately quiet affordance. Contract: visible only when the parent
// says the caller may retire (admin + not already retired), and it hands off
// to the parent rather than mutating anything itself.

vi.mock('./actions', () => ({
  updatePatientDemographics: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { PatientEditSheet } from './PatientEditSheet'

const PATIENT = {
  id: 'patient-1',
  clinic_id: 'clinic-1',
  patient_id: 42,
  patient_number: 'P-42',
  first_name: 'Grace',
  last_name: 'Auma',
  display_name: null,
  whatsapp_number: null,
  date_of_birth: null,
  sex: 'F',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  birth_year: null,
  approximate_age: null,
  age_recorded_at: null,
  dob_precision: 'unknown',
  village: null,
  parish: null,
  subcounty: null,
  district: null,
  guardian_name: null,
  guardian_relationship: null,
  national_id: null,
  derived_age: null,
  retired_at: null,
  retired_by: null,
  retired_reason: null,
  merged_into_patient_id: null,
} as PatientWithDerivedAge

afterEach(() => {
  cleanup()
})

describe('PatientEditSheet — retire entry point', () => {
  it('shows the retire trigger for admins and hands off to the parent', () => {
    const onRetireRequest = vi.fn()
    render(
      <PatientEditSheet
        open
        onOpenChange={vi.fn()}
        patient={PATIENT}
        onSaved={vi.fn()}
        canRetire
        onRetireRequest={onRetireRequest}
      />,
    )

    const trigger = screen.getByText('Retire duplicate record…')
    fireEvent.click(trigger)
    expect(onRetireRequest).toHaveBeenCalledTimes(1)
  })

  it('hides the retire trigger when the caller may not retire', () => {
    render(
      <PatientEditSheet
        open
        onOpenChange={vi.fn()}
        patient={PATIENT}
        onSaved={vi.fn()}
        canRetire={false}
        onRetireRequest={vi.fn()}
      />,
    )

    expect(screen.queryByText('Retire duplicate record…')).not.toBeInTheDocument()
    // The name-correction path (FEAT-1) stays intact regardless.
    expect(screen.getByLabelText('First name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Last name *')).toBeInTheDocument()
  })
})
