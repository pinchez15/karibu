import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RecordsDeskMock } from './mock-screens'

afterEach(cleanup)

/**
 * Field report 2026-07-10: a new staff member onboarding on a laptop/tablet
 * had "no button to click in step 1". The only click target for the
 * `open-patients` step was a fallback button hidden at >= sm widths
 * (`sm:hidden`), while the sidebar "Patients" item it pointed at was an
 * inert <div>. Every step that requires a mock action must expose a real
 * clickable element that is not viewport-gated.
 */
describe('RecordsDeskMock — step 1 (open-patients)', () => {
  it('renders a clickable sidebar target that fires the step action', () => {
    const onStepAction = vi.fn()
    render(<RecordsDeskMock activeStepId="open-patients" onStepAction={onStepAction} />)

    // The sidebar "Patients" entry must be a real button when it is the
    // highlighted step target (not just decorated text).
    const sidebarButton = screen.getByRole('button', { name: 'Patients' })
    fireEvent.click(sidebarButton)

    expect(onStepAction).toHaveBeenCalledWith('open-patients')
  })

  it('keeps the small-screen fallback button wired to the same action', () => {
    const onStepAction = vi.fn()
    render(<RecordsDeskMock activeStepId="open-patients" onStepAction={onStepAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Patients' }))

    expect(onStepAction).toHaveBeenCalledWith('open-patients')
  })

  it('sidebar is inert on steps that do not target it', () => {
    const onStepAction = vi.fn()
    render(<RecordsDeskMock activeStepId="search-first" onStepAction={onStepAction} />)

    expect(screen.queryByRole('button', { name: 'Patients' })).toBeNull()
  })
})
