import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingDictationCard } from './PendingDictationCard'
import { autosaveDraftNote } from './note-actions'

// PendingDictationCard pulls in a Clerk hook, autosave/sign server actions,
// and the pharmacy order action. None of that is under test here — only
// that the reused VisitLabPanel renders in the editor's orders area (T2).
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('test-token') }),
}))

vi.mock('./note-actions', () => ({
  autosaveDraftNote: vi.fn().mockResolvedValue({ success: true }),
  queueDraftAiAssist: vi.fn().mockResolvedValue(undefined),
  saveDraftNote: vi.fn().mockResolvedValue({ success: true }),
  signClinicianNote: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../actions', () => ({
  submitPharmacyOrder: vi.fn().mockResolvedValue({ success: true }),
}))

const submitLabOrderMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/app/dashboard/visits/actions', () => ({
  submitLabOrder: (...args: unknown[]) => submitLabOrderMock(...args),
}))

describe('PendingDictationCard — lab ordering in the orders area (T2)', () => {
  beforeEach(() => {
    submitLabOrderMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the reused lab catalog checklist for a clinical role before any test has been ordered', () => {
    render(<PendingDictationCard visitId="visit-1" staffRole="doctor" />)

    // "Order lab tests" appears both as the disclosure summary and as
    // VisitLabPanel's own heading — assert both are present.
    expect(screen.getAllByText('Order lab tests').length).toBeGreaterThanOrEqual(2)
    // Catalog names come straight from LAB_CATALOG_TESTS via VisitLabPanel —
    // no new catalog code, just confirming it's reachable from the editor.
    expect(screen.getByText('Malaria RDT')).toBeInTheDocument()
    expect(screen.getByText('Haemoglobin')).toBeInTheDocument()
  })

  it('does not render the lab disclosure for a non-clinical role', () => {
    render(<PendingDictationCard visitId="visit-1" staffRole="dispenser" />)

    expect(screen.queryByText('Malaria RDT')).not.toBeInTheDocument()
  })

  it('submitting a lab order from the editor writes the catalog test name for the visit (regression guard)', async () => {
    render(<PendingDictationCard visitId="visit-42" staffRole="doctor" />)

    const checkboxLabel = screen.getByText('Malaria RDT').closest('label')
    const checkbox = checkboxLabel?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    fireEvent.click(checkbox!)

    fireEvent.click(screen.getByText('Send to lab'))

    await waitFor(() => {
      expect(submitLabOrderMock).toHaveBeenCalledWith('visit-42', ['Malaria RDT'])
    })
  })
})

describe('PendingDictationCard — flush pending autosave on teardown', () => {
  const autosaveDraftNoteMock = vi.mocked(autosaveDraftNote)

  beforeEach(() => {
    autosaveDraftNoteMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('flushes the debounced autosave on unmount instead of dropping the typed content', async () => {
    const { unmount } = render(<PendingDictationCard visitId="visit-7" staffRole="doctor" />)

    const editor = screen.getByPlaceholderText(/Dictate the visit/i)
    fireEvent.change(editor, {
      target: { value: 'Patient reports fever and chills for two days.' },
    })

    // Unmount (e.g. navigating away) well inside the 1500ms autosave debounce
    // window — before this fix, the debounce effect's cleanup only cleared
    // the pending timeout, so this content was silently never persisted.
    expect(autosaveDraftNoteMock).not.toHaveBeenCalled()
    unmount()

    await waitFor(() => {
      expect(autosaveDraftNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          visit_id: 'visit-7',
          transcript: expect.stringContaining('Patient reports fever and chills for two days.'),
        }),
      )
    })

    // Guard against the unmount cleanup and the pagehide/visibilitychange
    // listener both firing a flush for the same pending edit.
    expect(autosaveDraftNoteMock).toHaveBeenCalledTimes(1)
  })

  it('flushes the debounced autosave on pagehide (tab close / navigation away)', async () => {
    render(<PendingDictationCard visitId="visit-8" staffRole="doctor" />)

    const editor = screen.getByPlaceholderText(/Dictate the visit/i)
    fireEvent.change(editor, {
      target: { value: 'Patient reports a persistent cough for one week.' },
    })

    expect(autosaveDraftNoteMock).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pagehide'))

    await waitFor(() => {
      expect(autosaveDraftNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          visit_id: 'visit-8',
          transcript: expect.stringContaining('Patient reports a persistent cough for one week.'),
        }),
      )
    })
    expect(autosaveDraftNoteMock).toHaveBeenCalledTimes(1)
  })
})
