import { describe, expect, it } from 'vitest'
import { addMonths, forecast, type CashflowData, type Cost } from './cashflow'
import { daysLate, portfolio } from './portfolio'
import type { ClinicAccount } from './types'

function clinic(id: string, stage: ClinicAccount['stage'], tier: ClinicAccount['tier'], patch: Partial<ClinicAccount> = {}): ClinicAccount {
  return {
    id, office_id: 'o', clinic_id: null, name: id, district: null, facility_level: null, contact_name: null,
    contact_phone: null, champion_name: null, champion_phone: null, stage, tier, source: 'manual',
    assigned_member_id: null, assigned_member: null, go_live_mode: null, next_action: null, next_action_at: null,
    last_contact_at: null, notes: null, staff_count: null, readiness_cleared_at: null, billing_starts_on: null,
    created_at: '2026-01-01T00:00:00Z', health: null, ...patch,
  }
}

const cost = (label: string, amount: number, patch: Partial<Cost> = {}): Cost => ({
  id: label, label, amount, currency: 'UGX', cadence: 'monthly', starts_on: '2026-01-01', ends_on: null, ...patch,
})

const empty: CashflowData = { balance: null, costs: [], open_invoices: [], pay_habits: [], collected_by_month: [] }

// Two Core (65,000), one Full (130,000), one Pro (260,000) = 520,000 a month.
const clinics = [
  clinic('a', 'live', 'core'), clinic('b', 'steady', 'core'), clinic('c', 'billed', 'full'), clinic('d', 'live', 'pro'),
  clinic('lead', 'lead', 'full'), clinic('gone', 'churned', 'pro'),
]

describe('addMonths', () => {
  it('rolls over the year', () => {
    expect(addMonths('2026-11-01', 1)).toBe('2026-12-01')
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01')
  })
})

describe('forecast', () => {
  it('starts the month after this one and counts only live clinics', () => {
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data: empty, partnerFee: 0 })
    expect(f.months.map((m) => m.month)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01'])
    expect(f.mrr).toBe(520_000)
    expect(f.liveClinics).toBe(4)
    expect(f.months.every((m) => m.subscriptions === 520_000)).toBe(true)
  })

  it('says what is missing instead of pretending', () => {
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics: [], data: empty, partnerFee: 0 })
    expect(f.missing).toEqual(['balance', 'costs', 'clinics'])
    expect(f.months[0].closing).toBeNull()
    expect(f.breakEvenClinics).toBeNull()
    expect(f.tightest).toBeNull()
  })

  it('flags live clinics that have no plan', () => {
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics: [...clinics, clinic('noplan', 'live', null)], data: { ...empty, balance: { amount: 1, at: '' }, costs: [cost('x', 1)] }, partnerFee: 0 })
    expect(f.missing).toEqual(['plans'])
  })

  it('carries the balance forward through costs and the partner fee', () => {
    const data: CashflowData = { ...empty, balance: { amount: 1_000_000, at: '2026-11-23' }, costs: [cost('Transport', 380_000), cost('Pay', 100_000)] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 20_000 })
    expect(f.months[0].moneyOut).toBe(500_000)
    expect(f.months[0].net).toBe(20_000)
    expect(f.months.map((m) => m.closing)).toEqual([1_020_000, 1_040_000, 1_060_000, 1_080_000, 1_100_000, 1_120_000])
    expect(f.monthlyCosts).toBe(500_000)
    // 500,000 / 130,000 average = 3.85, so four clinics.
    expect(f.breakEvenClinics).toBe(4)
    expect(f.lowest).toBeNull()
  })

  it('a cost with a future start date is a plan: it shows up from that month and marks the tightest', () => {
    const data: CashflowData = { ...empty, balance: { amount: 500_000, at: '' }, costs: [cost('Pay', 400_000), cost('Support person', 600_000, { starts_on: '2027-02-01' })] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 0 })
    expect(f.months.map((m) => m.net)).toEqual([120_000, 120_000, -480_000, -480_000, -480_000, -480_000])
    expect(f.tightest).toBe(2)
    expect(f.lowest).toBe(5)
    expect(f.months[5].closing).toBe(500_000 + 240_000 - 4 * 480_000)
  })

  it('a one-off cost lands in its month only and is not a recurring cost', () => {
    const data: CashflowData = { ...empty, costs: [cost('Pay', 100_000), cost('Printer', 250_000, { cadence: 'once', starts_on: '2026-12-01' })] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 0 })
    expect(f.months[0].moneyOut).toBe(350_000)
    expect(f.months[1].moneyOut).toBe(100_000)
    expect(f.monthlyCosts).toBe(100_000)
  })

  it('an ended cost stops', () => {
    const data: CashflowData = { ...empty, costs: [cost('Loan', 50_000, { ends_on: '2027-01-31' })] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 0 })
    expect(f.months.map((m) => m.moneyOut)).toEqual([50_000, 50_000, 0, 0, 0, 0])
  })

  it('unpaid invoices are expected in the first month', () => {
    const data: CashflowData = { ...empty, open_invoices: [
      { id: '1', number: 'KU-1', clinic_account_id: 'a', clinic_name: 'a', balance: 65_000, due_date: '2026-11-14', issue_date: '2026-11-01' },
      { id: '2', number: 'KU-2', clinic_account_id: 'c', clinic_name: 'c', balance: 130_000, due_date: '2026-11-14', issue_date: '2026-11-01' },
    ] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 0 })
    expect(f.months[0].unpaid).toBe(195_000)
    expect(f.months[0].moneyIn).toBe(715_000)
    expect(f.months[1].unpaid).toBe(0)
  })

  it('a clinic that pays late is left out of the first month, but only once its habit is established', () => {
    const data: CashflowData = { ...empty, pay_habits: [
      { clinic_account_id: 'd', clinic_name: 'd', paid_invoices: 3, avg_days: 26 },
      { clinic_account_id: 'c', clinic_name: 'c', paid_invoices: 1, avg_days: 40 },
      { clinic_account_id: 'a', clinic_name: 'a', paid_invoices: 5, avg_days: 6 },
    ] }
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data, partnerFee: 0 })
    expect(f.latePayers.map((p) => p.clinic_account_id)).toEqual(['d'])
    expect(f.months[0].subscriptions).toBe(260_000)
    expect(f.months[1].subscriptions).toBe(520_000)
    expect(f.tightest).toBe(0)
  })

  it('what-if: signing clinics adds setup fees now and subscriptions from the month after', () => {
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics, data: empty, partnerFee: 0, signPerMonth: 2 })
    // Setup is 150,000; the average live clinic pays 130,000.
    expect(f.months[0].newClinics).toBe(300_000)
    expect(f.months[1].newClinics).toBe(300_000 + 2 * 130_000)
    expect(f.months[2].newClinics).toBe(300_000 + 4 * 130_000)
  })

  it('with no live clinics, break-even is priced at the Core plan', () => {
    const f = forecast({ thisMonth: '2026-11-01', country: 'UG', clinics: [], data: { ...empty, costs: [cost('Pay', 650_000)] }, partnerFee: 0 })
    expect(f.avgPerClinic).toBe(65_000)
    expect(f.breakEvenClinics).toBe(10)
  })
})

describe('portfolio', () => {
  const now = Date.parse('2026-11-25T09:00:00Z')

  it('sums live value, pipeline value and the health mix', () => {
    const p = portfolio([
      clinic('a', 'live', 'core', { health: { score: 'red', reasons: [], day: '' } }),
      clinic('b', 'steady', 'pro', { health: { score: 'green', reasons: [], day: '' } }),
      clinic('c', 'live', null),
      clinic('d', 'demo', 'full'),
      clinic('e', 'trained', 'core'),
      clinic('f', 'lead', null),
      clinic('g', 'churned', 'pro'),
    ], 'UG', now)
    expect(p.mrr).toBe(325_000)
    expect(p.liveWithoutPlan).toBe(1)
    expect(p.health).toEqual({ green: 1, amber: 0, red: 1, unknown: 1 })
    expect(p.pipelineValue).toBe(195_000)
    expect(p.pipelineWithoutPlan).toBe(1)
    expect(p.sales.map((c) => c.id)).toEqual(['d', 'f'])
    expect(p.onboarding.map((c) => c.id)).toEqual(['e'])
  })

  it('finds follow-ups whose date has passed, in sales and onboarding only', () => {
    const p = portfolio([
      clinic('late', 'contacted', 'core', { next_action_at: '2026-11-20T09:00:00Z' }),
      clinic('soon', 'contacted', 'core', { next_action_at: '2026-11-28T09:00:00Z' }),
      clinic('live-late', 'live', 'core', { next_action_at: '2026-11-01T09:00:00Z' }),
    ], 'UG', now)
    expect(p.followUpsOverdue.map((c) => c.id)).toEqual(['late'])
    expect(daysLate('2026-11-20T09:00:00Z', now)).toBe(5)
    expect(daysLate('2026-11-28T09:00:00Z', now)).toBe(0)
    expect(daysLate(null, now)).toBe(0)
  })
})
