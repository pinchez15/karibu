import { describe, expect, it } from 'vitest'
import { NEED, funnelPanel, panels, paymentsPanel, rankClinics, readyCount, staffPanel, supportPanel, usagePanel, type AnalyticsData, type ClinicRow } from './analytics'

const NOW = Date.parse('2026-11-25T09:00:00Z')

function weeks(visits: number[], clinics: number[] = []) {
  return visits.map((v, i) => ({ week: `2026-${String(i + 1).padStart(2, '0')}-01`, visits: v, clinics: clinics[i] ?? (v > 0 ? 1 : 0) }))
}

function data(patch: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    paused: [], live_clinics: 3, first_live_at: '2026-08-14T08:00:00Z',
    weeks: weeks([10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 20, 22]),
    staff: { clinics: 3, with_account: 20, active_7d: 15, as_of: '2026-11-25' },
    funnel: { leads: 40, contacted: 28, demo: 16, onboarding: 10, live: 6 },
    days_to_live: { clinics: 6, median: 34 },
    payments: { paid_invoices: 12, within_30: 11, median_days: 9 },
    support: { requests: 31, solved: 25, solved_alone: 21, replied: 28, median_reply_minutes: 42 },
    clinics: [],
    ...patch,
  }
}

describe('usage panel', () => {
  it('waits for a first live clinic', () => {
    expect(usagePanel(data({ live_clinics: 0 }))).toEqual({ status: 'collecting', have: 0, need: 1, unit: 'clinics' })
  })

  it('collects until four weeks have visits, and says how far along it is', () => {
    const p = usagePanel(data({ weeks: weeks([0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 8, 9]) }))
    expect(p).toEqual({ status: 'collecting', have: 3, need: NEED.usageWeeks, unit: 'weeks' })
  })

  it('shows the chart at four weeks but no trend until there are eight to compare', () => {
    const p = usagePanel(data({ weeks: weeks([0, 0, 0, 0, 0, 0, 0, 0, 5, 8, 9, 10]) }))
    expect(p.status).toBe('ready')
    if (p.status !== 'ready') return
    expect(p.weeks).toHaveLength(4)
    expect(p.trendPct).toBeNull()
    expect(p.lastWeek).toBe(10)
  })

  it('compares the last four weeks with the four before once it can', () => {
    const p = usagePanel(data({ weeks: weeks([0, 0, 0, 0, 10, 10, 10, 10, 12, 12, 12, 12]) }))
    expect(p.status === 'ready' && p.trendPct).toBe(20)
  })

  it('withholds the trend when the recent weeks are empty', () => {
    const p = usagePanel(data({ weeks: weeks([10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 0, 0]) }))
    expect(p).toEqual({ status: 'stale', quietWeeks: 2, lastWeekWithVisits: '2026-10-01' })
  })

  it('one quiet week is not enough to withhold it', () => {
    expect(usagePanel(data({ weeks: weeks([10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 20, 0]) })).status).toBe('ready')
  })

  it('flags growth that comes from more clinics reporting', () => {
    const p = usagePanel(data({ weeks: weeks([10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30], [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]) }))
    expect(p.status === 'ready' && p.moreClinicsReporting).toBe(true)
  })

  it('survives a payload with no weeks at all', () => {
    expect(usagePanel(data({ weeks: null })).status).toBe('collecting')
  })
})

describe('staff panel', () => {
  it('collects until there are enough accounts to take a share of', () => {
    expect(staffPanel(data({ staff: { clinics: 1, with_account: 3, active_7d: 3, as_of: '2026-11-25' } }), NOW))
      .toEqual({ status: 'collecting', have: 3, need: NEED.staffAccounts, unit: 'accounts' })
  })

  it('is stale when the nightly snapshot stopped arriving', () => {
    expect(staffPanel(data({ staff: { clinics: 3, with_account: 20, active_7d: 15, as_of: '2026-11-18' } }), NOW))
      .toEqual({ status: 'stale', asOf: '2026-11-18' })
  })

  it('never reports more active staff than accounts', () => {
    const p = staffPanel(data({ staff: { clinics: 3, with_account: 10, active_7d: 12, as_of: '2026-11-25' } }), NOW)
    expect(p).toEqual({ status: 'ready', active: 10, total: 10, idle: 0, pct: 100 })
  })

  it('reports the share when ready', () => {
    expect(staffPanel(data(), NOW)).toEqual({ status: 'ready', active: 15, total: 20, idle: 5, pct: 75 })
  })
})

describe('funnel panel', () => {
  it('shows counts but no rates below ten leads', () => {
    const p = funnelPanel(data({ funnel: { leads: 4, contacted: 3, demo: 2, onboarding: 1, live: 1 } }))
    expect(p.status).toBe('collecting')
    if (p.status !== 'collecting') return
    expect(p.have).toBe(4)
    expect(p.steps.map((s) => s.n)).toEqual([4, 3, 2, 1, 1])
    expect(p.steps.every((s) => s.pct === null)).toBe(true)
  })

  it('shows step-to-step rates and names the weakest step', () => {
    const p = funnelPanel(data())
    expect(p.status).toBe('ready')
    if (p.status !== 'ready') return
    expect(p.steps.map((s) => s.pct)).toEqual([null, 70, 57, 63, 60])
    expect(p.weakest).toBe('demo')
    expect(p.daysToLive).toBe(34)
  })

  it('does not call a step weak when the step before it is tiny', () => {
    const p = funnelPanel(data({ funnel: { leads: 10, contacted: 4, demo: 4, onboarding: 1, live: 0 } }))
    // Only "contacted" follows a step with five or more clinics.
    expect(p.status === 'ready' && p.weakest).toBe('contacted')
  })

  it('withholds days-to-live from fewer than three clinics', () => {
    const p = funnelPanel(data({ days_to_live: { clinics: 2, median: 12 } }))
    expect(p.status === 'ready' && p.daysToLive).toBeNull()
  })

  it('survives a payload with no funnel', () => {
    expect(funnelPanel(data({ funnel: null })).status).toBe('collecting')
  })
})

describe('payments and support panels', () => {
  it('payments collect until five invoices are paid', () => {
    expect(paymentsPanel(data({ payments: { paid_invoices: 2, within_30: 2, median_days: 4 } })))
      .toEqual({ status: 'collecting', have: 2, need: NEED.paidInvoices, unit: 'invoices' })
    expect(paymentsPanel(data())).toEqual({ status: 'ready', paid: 12, within30Pct: 92, medianDays: 9 })
  })

  it('support collects until five requests, then withholds medians it cannot stand behind', () => {
    expect(supportPanel(data({ support: { requests: 1, solved: 1, solved_alone: 1, replied: 1, median_reply_minutes: 5 } })).status).toBe('collecting')
    expect(supportPanel(data({ support: { requests: 6, solved: 2, solved_alone: 2, replied: 2, median_reply_minutes: 5 } })))
      .toEqual({ status: 'ready', requests: 6, medianReplyMinutes: null, solvedAlonePct: null })
    expect(supportPanel(data())).toEqual({ status: 'ready', requests: 31, medianReplyMinutes: 42, solvedAlonePct: 84 })
  })
})

describe('pausing', () => {
  it('a paused panel computes nothing, whatever the data says', () => {
    const p = panels(data({ paused: ['funnel', 'usage'] }), NOW)
    expect(p.funnel).toEqual({ status: 'paused' })
    expect(p.usage).toEqual({ status: 'paused' })
    expect(p.staff.status).toBe('ready')
    expect(readyCount(p)).toBe(3)
  })

  it('a brand-new office has nothing ready and nothing broken', () => {
    const p = panels({
      paused: [], live_clinics: 0, first_live_at: null, weeks: null, staff: null, funnel: null,
      days_to_live: null, payments: null, support: null, clinics: [],
    }, NOW)
    expect(readyCount(p)).toBe(0)
    expect(Object.values(p).every((x) => x.status === 'collecting')).toBe(true)
  })
})

describe('ranking clinics', () => {
  const row = (name: string, score: ClinicRow['score'], now: number | null, usual: number | null): ClinicRow => ({
    id: name, name, district: null, tier: null, score, visits_per_day: now, baseline_visits_per_day: usual,
    active_staff_7d: null, staff_total: null, avg_days_to_pay: null, requests_30d: 0,
  })

  it('puts the clinics that need the partner first', () => {
    const ranked = rankClinics([
      row('Healthy', 'green', 30, 30), row('New', null, null, null), row('Dropping', 'amber', 10, 30),
      row('Silent', 'red', 0, 28), row('Wobbly', 'amber', 25, 30),
    ])
    expect(ranked.map((r) => r.name)).toEqual(['Silent', 'Dropping', 'Wobbly', 'Healthy', 'New'])
  })
})
