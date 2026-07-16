import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicAppointment } from '@/lib/calendar-events'

// The month calendar moved here from Home; keep the heavy client deps
// (FullCalendar, shell) out of the render and assert the route composes the
// loader + calendar correctly.
const getStaff = vi.fn()
const loadClinicAppointments = vi.fn()

vi.mock('@/lib/auth', () => ({ getStaff: () => getStaff() }))
vi.mock('@/lib/calendar-load', () => ({
  loadClinicAppointments: (...args: unknown[]) => loadClinicAppointments(...args),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/components/web-shell', () => ({
  WebTopBar: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('@/components/clinic-calendar/ClinicCalendar', () => ({
  ClinicCalendar: ({ initialAppointments }: { initialAppointments: ClinicAppointment[] }) => (
    <div data-testid="clinic-calendar">calendar: {initialAppointments.length} appointments</div>
  ),
}))

import CalendarPage from './page'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('/dashboard/calendar route', () => {
  it('loads clinic appointments and renders the month calendar', async () => {
    getStaff.mockResolvedValue({ clinic_id: 'clinic-1' })
    loadClinicAppointments.mockResolvedValue([
      { id: 'a1' },
      { id: 'a2' },
    ] as ClinicAppointment[])

    render(await CalendarPage())

    expect(loadClinicAppointments).toHaveBeenCalledWith('clinic-1', { daysBack: 14, daysForward: 28 })
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByTestId('clinic-calendar')).toHaveTextContent('2 appointments')
  })
})
