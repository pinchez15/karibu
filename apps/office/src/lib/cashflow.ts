// A six-month cash forecast for a partner's business.
//
// Karibu Office never holds or moves money (ADR-0002 §8). This is arithmetic
// on things the office already has: its live clinics and their plans, unpaid
// invoices, how long each clinic has taken to pay before, and the costs and
// opening balance the partner types in. Pure functions, unit tested.
import { PRICE_BOOKS, type CountryCode } from '@karibu/shared'
import { LIVE_STAGES } from './portfolio'
import type { ClinicAccount } from './types'

export interface Cost {
  id: string
  label: string
  amount: number
  currency: string
  cadence: 'monthly' | 'once'
  /** First day of the month the cost starts in (monthly) or falls in (once). */
  starts_on: string
  ends_on: string | null
}

export interface CashflowData {
  balance: { amount: number; at: string } | null
  costs: Cost[]
  open_invoices: { id: string; number: string; clinic_account_id: string; clinic_name: string | null; balance: number; due_date: string; issue_date: string }[]
  pay_habits: { clinic_account_id: string; clinic_name: string; paid_invoices: number; avg_days: number }[]
  collected_by_month: { month: string; collected: number }[]
}

/** A clinic that takes longer than this to pay is treated as paying a month behind. */
export const LATE_DAYS = 21
/** Paid invoices needed before a clinic's payment habit is believed. */
export const HABIT_MIN_INVOICES = 2

export interface ForecastInput {
  /** First day of the current month, YYYY-MM-DD. The forecast starts the month after. */
  thisMonth: string
  country: CountryCode
  clinics: ClinicAccount[]
  data: CashflowData
  /** The office's own fee to Karibu each month, 0 if it has not started. */
  partnerFee: number
  /** What-if: clinics signed each month from the first forecast month. */
  signPerMonth?: number
  months?: number
}

export interface ForecastMonth {
  /** First day of the month, YYYY-MM-DD. */
  month: string
  subscriptions: number
  unpaid: number
  newClinics: number
  moneyIn: number
  costs: { label: string; amount: number }[]
  moneyOut: number
  net: number
  /** Null when the partner has not entered an opening balance. */
  closing: number | null
}

export interface Forecast {
  months: ForecastMonth[]
  /** Monthly subscription value of live clinics with a plan. */
  mrr: number
  /** Recurring costs in the first forecast month, including the partner fee. */
  monthlyCosts: number
  /** Live clinics needed to cover monthlyCosts. Null when there is no cost to cover. */
  breakEvenClinics: number | null
  liveClinics: number
  avgPerClinic: number
  /** Index into months of the smallest net. Null when every month is the same. */
  tightest: number | null
  /** Index of the lowest closing balance, when a balance was entered and it dips below today's. */
  lowest: number | null
  latePayers: { clinic_account_id: string; clinic_name: string; avg_days: number }[]
  /** What the forecast is missing, so the page can ask for it instead of showing a confident wrong number. */
  missing: ('balance' | 'costs' | 'clinics' | 'plans')[]
}

export function addMonths(isoMonth: string, n: number): string {
  const [y, m] = isoMonth.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

function costApplies(cost: Cost, month: string): boolean {
  const start = cost.starts_on.slice(0, 7)
  const here = month.slice(0, 7)
  if (cost.cadence === 'once') return start === here
  if (start > here) return false
  return !cost.ends_on || cost.ends_on.slice(0, 7) >= here
}

export function forecast(input: ForecastInput): Forecast {
  const { country, data, partnerFee } = input
  const count = input.months ?? 6
  const sign = Math.max(0, input.signPerMonth ?? 0)
  const book = PRICE_BOOKS[country]
  const live = input.clinics.filter((c) => LIVE_STAGES.includes(c.stage))
  const priced = live.filter((c) => c.tier)
  const price = (c: ClinicAccount) => (c.tier ? book.monthly[c.tier] : 0)
  const mrr = priced.reduce((sum, c) => sum + price(c), 0)
  const avgPerClinic = priced.length ? Math.round(mrr / priced.length) : book.monthly.core

  const latePayers = data.pay_habits
    .filter((h) => h.paid_invoices >= HABIT_MIN_INVOICES && h.avg_days > LATE_DAYS)
    .map(({ clinic_account_id, clinic_name, avg_days }) => ({ clinic_account_id, clinic_name, avg_days }))
  const lateIds = new Set(latePayers.map((h) => h.clinic_account_id))
  // A late payer's next invoice lands a month behind, so the first month goes without it.
  const lateFirstMonth = priced.filter((c) => lateIds.has(c.id)).reduce((sum, c) => sum + price(c), 0)
  const unpaid = data.open_invoices.reduce((sum, i) => sum + i.balance, 0)

  const months: ForecastMonth[] = []
  let running = data.balance?.amount ?? null
  for (let i = 0; i < count; i++) {
    const month = addMonths(input.thisMonth, i + 1)
    const costs = data.costs.filter((c) => costApplies(c, month)).map((c) => ({ label: c.label, amount: c.amount }))
    if (partnerFee > 0) costs.push({ label: 'partner_fee', amount: partnerFee })
    const subscriptions = mrr - (i === 0 ? lateFirstMonth : 0)
    // Clinics signed in earlier months are paying by now; this month's signings pay setup.
    const newClinics = sign > 0 ? sign * book.setup + sign * i * avgPerClinic : 0
    const moneyIn = subscriptions + (i === 0 ? unpaid : 0) + newClinics
    const moneyOut = costs.reduce((sum, c) => sum + c.amount, 0)
    const net = moneyIn - moneyOut
    if (running !== null) running += net
    months.push({ month, subscriptions, unpaid: i === 0 ? unpaid : 0, newClinics, moneyIn, costs, moneyOut, net, closing: running })
  }

  const recurring = (m: ForecastMonth) => m.moneyOut
  const monthlyCosts = months.length ? recurring(months[0]) - data.costs
    .filter((c) => c.cadence === 'once' && costApplies(c, months[0].month)).reduce((s, c) => s + c.amount, 0) : 0

  let tightest: number | null = null
  if (months.some((m) => m.net !== months[0].net)) {
    tightest = months.reduce((best, m, i) => (m.net < months[best].net ? i : best), 0)
  }
  let lowest: number | null = null
  if (data.balance) {
    const idx = months.reduce((best, m, i) => ((m.closing ?? 0) < (months[best].closing ?? 0) ? i : best), 0)
    if ((months[idx]?.closing ?? Infinity) < data.balance.amount) lowest = idx
  }

  const missing: Forecast['missing'] = []
  if (!data.balance) missing.push('balance')
  if (data.costs.length === 0) missing.push('costs')
  if (live.length === 0) missing.push('clinics')
  else if (priced.length < live.length) missing.push('plans')

  return {
    months, mrr, monthlyCosts, liveClinics: live.length, avgPerClinic,
    breakEvenClinics: monthlyCosts > 0 ? Math.ceil(monthlyCosts / avgPerClinic) : null,
    tightest, lowest, latePayers, missing,
  }
}
