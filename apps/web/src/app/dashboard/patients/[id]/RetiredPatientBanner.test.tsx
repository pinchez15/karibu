import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RetiredPatientBanner } from './RetiredPatientBanner'

// The retired chart must not 404 — it renders history under this banner.
// Contract: retire date + reason shown; when a surviving record was set the
// banner links to it, otherwise it explains that the history is read-only.

afterEach(() => {
  cleanup()
})

describe('RetiredPatientBanner', () => {
  it('shows the retire date, reason, and a link to the surviving record', () => {
    render(
      <RetiredPatientBanner
        retiredAt="2026-07-14T09:30:00Z"
        reason="Registered twice at the front desk."
        mergedInto={{ id: 'patient-survivor', name: 'Grace Auma' }}
      />,
    )

    expect(
      screen.getByText(/retired on 14 Jul 2026 \(duplicate registration\)/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Registered twice at the front desk.')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Grace Auma' })
    expect(link).toHaveAttribute('href', '/dashboard/patients/patient-survivor')
  })

  it('falls back to a read-only explanation when no surviving record was set', () => {
    render(
      <RetiredPatientBanner
        retiredAt="2026-07-14T09:30:00Z"
        reason={null}
        mergedInto={null}
      />,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(
      screen.getByText(/new activity is disabled on this record/i),
    ).toBeInTheDocument()
  })
})
