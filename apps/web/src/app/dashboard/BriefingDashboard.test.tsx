import { render, screen, within, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicAppointment } from '@/lib/calendar-events'
import type { BriefingData } from '@/lib/dashboard-briefing-helpers'
import { BriefingDashboard } from './BriefingDashboard'

// next/link renders a plain anchor in jsdom; stub to be explicit.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href as string} {...rest}>
      {children}
    </a>
  ),
}))

function appt(id: string, scheduled_at: string): ClinicAppointment {
  return {
    id,
    patient_id: null,
    patient_name: null,
    event_type: 'follow_up',
    title: `Event ${id}`,
    reason: null,
    scheduled_at,
    scheduled_end: null,
    unit: null,
    status: 'scheduled',
  }
}

function makeData(overrides: Partial<BriefingData> = {}): BriefingData {
  return {
    dateLabel: 'Friday, 17 July 2026',
    daySize: { visitsToday: 42, waitingNow: 7, withClinicianNow: 3, toFinalize: 5 },
    stations: {
      opd: { waiting: 7, withClinician: 3, toFinalize: 5 },
      inpatient: { admitted: 4 },
      lab: { visitsOnBench: 6, openTests: 9 },
      pharmacy: { toDispense: 8, partial: 2, returned: 1, lowStock: 3 },
      anc: { active: 12 },
      hivTb: { hiv: 20, tb: 4 },
    },
    needsAttention: [
      { id: 'stock', severity: 40, label: 'Out of stock', detail: '3 items unavailable', href: '/dashboard/stock-overview', tone: 'amber' },
      { id: 'finalize', severity: 30, label: 'Notes to finalize', detail: '5 visits need sign-off', href: '/dashboard/review', tone: 'amber' },
      { id: 'balances', severity: 10, label: 'Outstanding balances', detail: '9 patients owe', href: '/dashboard/billing', tone: 'slate' },
    ],
    appointments: [
      appt('a1', new Date(2026, 6, 17, 9, 0).toISOString()),
      appt('a2', new Date(2026, 6, 19, 10, 0).toISOString()),
    ],
    monthToDate: {
      monthLabel: 'JULY 2026',
      opdVisits: 310,
      admissions: 18,
      revenueUgx: 1250000,
      chargedUgx: 1400000,
      uniquePatients: 205,
      hmisDueLabel: '7 Aug',
    },
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('BriefingDashboard', () => {
  it('renders the day-size banner with clinic-wide counts', () => {
    render(<BriefingDashboard data={makeData()} />)
    expect(screen.getByText('Friday, 17 July 2026')).toBeInTheDocument()
    // Banner metrics.
    for (const [label, value] of [
      ['Visits today', '42'],
      ['Waiting now', '7'],
      ['With a clinician', '3'],
    ] as const) {
      const el = screen.getByText(label).parentElement!
      expect(within(el).getByText(value)).toBeInTheDocument()
    }
  })

  it('renders every station tile with its real counts and desk link', () => {
    render(<BriefingDashboard data={makeData()} />)

    const opd = screen.getByRole('link', { name: /OPD/ })
    expect(opd).toHaveAttribute('href', '/dashboard/opd')
    expect(within(opd).getByText('7')).toBeInTheDocument() // waiting

    const lab = screen.getByRole('link', { name: /Lab/ })
    expect(lab).toHaveAttribute('href', '/dashboard/lab')
    expect(within(lab).getByText('6')).toBeInTheDocument() // on bench
    expect(within(lab).getByText('9')).toBeInTheDocument() // open tests

    const pharmacy = screen.getByRole('link', { name: /Pharmacy/ })
    expect(within(pharmacy).getByText('8')).toBeInTheDocument() // to dispense

    const inpatient = screen.getByRole('link', { name: /Inpatient/ })
    expect(within(inpatient).getByText('4')).toBeInTheDocument()
  })

  it('renders a zero-source tile as 0 rather than crashing', () => {
    const data = makeData({
      stations: {
        opd: { waiting: 0, withClinician: 0, toFinalize: 0 },
        inpatient: { admitted: 0 },
        lab: { visitsOnBench: 0, openTests: 0 },
        pharmacy: { toDispense: 0, partial: 0, returned: 0, lowStock: 0 },
        anc: { active: 0 },
        hivTb: { hiv: 0, tb: 0 },
      },
    })
    render(<BriefingDashboard data={data} />)
    const inpatient = screen.getByRole('link', { name: /Inpatient/ })
    expect(within(inpatient).getByText('0')).toBeInTheDocument()
  })

  it('omits the ANC and HIV/TB tiles when their source is unavailable (no fake zero)', () => {
    render(<BriefingDashboard data={makeData({ stations: { ...makeData().stations, anc: null, hivTb: null } })} />)
    expect(screen.queryByRole('link', { name: /ANC/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /HIV \/ TB/ })).not.toBeInTheDocument()
    // Sibling tiles still render.
    expect(screen.getByRole('link', { name: /OPD/ })).toBeInTheDocument()
  })

  it('renders the needs-attention list in the given (severity) order', () => {
    render(<BriefingDashboard data={makeData()} />)
    const heading = screen.getByText('Needs attention')
    const section = heading.closest('section')!
    const labels = within(section)
      .getAllByRole('listitem')
      .map((li) => within(li).getByText(/Out of stock|Notes to finalize|Outstanding balances/).textContent)
    expect(labels).toEqual(['Out of stock', 'Notes to finalize', 'Outstanding balances'])
  })

  it('shows an all-clear message when nothing needs attention', () => {
    render(<BriefingDashboard data={makeData({ needsAttention: [] })} />)
    expect(screen.getByText(/every desk is clear/i)).toBeInTheDocument()
  })

  it('groups the calendar strip into 8 day columns with events on the right day', () => {
    render(<BriefingDashboard data={makeData()} />)
    const heading = screen.getByText('Today & next 7 days')
    const section = heading.closest('section')!
    // Event a1 (today) and a2 (day +2) both render as chips.
    expect(within(section).getByText('Event a1')).toBeInTheDocument()
    expect(within(section).getByText('Event a2')).toBeInTheDocument()
  })

  it('renders the month-to-date footer with revenue and HMIS due chip', () => {
    render(<BriefingDashboard data={makeData()} />)
    expect(screen.getByText(/Month to date · JULY 2026/)).toBeInTheDocument()
    expect(screen.getByText('UGX 1,250,000')).toBeInTheDocument()
    expect(screen.getByText(/HMIS 105 due 7 Aug/)).toBeInTheDocument()
  })
})
