// Analytics that start quietly and stop quietly.
//
// The database returns raw counts (office_analytics). This file decides, for
// each panel, whether there is enough behind those counts to show a trend:
//
//   collecting  not enough yet. The panel says what it is waiting for and how far along it is.
//   ready       enough to trust. Rates and trends are shown.
//   stale       there was enough, but the recent data has dried up, so the trend is withheld.
//   paused      the partner switched the panel off. Nothing is computed.
//
// A number from a tiny sample is worse than no number: "50% of quotes close"
// from two clinics would send a new entrepreneur in the wrong direction.
// Pure functions, so every threshold below is unit tested.

export type PanelKey = 'usage' | 'staff' | 'funnel' | 'payments' | 'support'
export const PANELS: PanelKey[] = ['usage', 'staff', 'funnel', 'payments', 'support']

export interface AnalyticsData {
  paused: string[]
  live_clinics: number
  first_live_at: string | null
  /** The 12 complete weeks before the current one, oldest first. */
  weeks: { week: string; visits: number; clinics: number }[] | null
  staff: { clinics: number; with_account: number; active_7d: number; as_of: string | null } | null
  funnel: { leads: number; contacted: number; demo: number; onboarding: number; live: number } | null
  days_to_live: { clinics: number; median: number | null } | null
  payments: { paid_invoices: number; within_30: number; median_days: number | null } | null
  support: { requests: number; solved: number; solved_alone: number; replied: number; median_reply_minutes: number | null } | null
  clinics: ClinicRow[]
}

export interface ClinicRow {
  id: string
  name: string
  district: string | null
  tier: 'core' | 'full' | 'pro' | null
  score: 'green' | 'amber' | 'red' | null
  visits_per_day: number | null
  baseline_visits_per_day: number | null
  active_staff_7d: number | null
  staff_total: number | null
  avg_days_to_pay: number | null
  requests_30d: number
}

/** How much data each panel needs before it shows rates or a trend. */
export const NEED = {
  /** Weeks with at least one recorded visit before a usage chart means anything. */
  usageWeeks: 4,
  /** Weeks with visits before "up or down" is shown: four recent against four earlier. */
  trendWeeks: 8,
  /** Recent weeks with no visits at all before the usage trend is withheld. */
  usageQuietWeeks: 2,
  /** Staff accounts across live clinics before a share of them is shown. */
  staffAccounts: 5,
  /** Days a health snapshot may be old before staff numbers are withheld. */
  staffFreshDays: 3,
  /** Leads in 90 days before conversion rates are shown. */
  funnelLeads: 10,
  /** Paid invoices in 180 days before payment speed is shown. */
  paidInvoices: 5,
  /** Requests in 30 days before support medians are shown. */
  supportRequests: 5,
} as const

export type Unit = 'weeks' | 'clinics' | 'accounts' | 'leads' | 'invoices' | 'requests'

type Collecting = { status: 'collecting'; have: number; need: number; unit: Unit }
type Paused = { status: 'paused' }

export type UsagePanel =
  | Paused | Collecting
  | { status: 'stale'; quietWeeks: number; lastWeekWithVisits: string | null }
  | {
      status: 'ready'
      weeks: { week: string; visits: number; clinics: number }[]
      lastWeek: number
      /** Percent change, last four weeks against the four before. Null until there are eight weeks to compare. */
      trendPct: number | null
      /** True when more clinics are reporting now than at the start, so growth is partly new clinics. */
      moreClinicsReporting: boolean
    }

export type StaffPanel =
  | Paused | Collecting
  | { status: 'stale'; asOf: string | null }
  | { status: 'ready'; active: number; total: number; idle: number; pct: number }

export type FunnelPanel =
  | Paused
  | (Collecting & { steps: FunnelStep[] })
  | { status: 'ready'; steps: FunnelStep[]; weakest: FunnelStep['key'] | null; daysToLive: number | null }

export interface FunnelStep {
  key: 'leads' | 'contacted' | 'demo' | 'onboarding' | 'live'
  n: number
  /** Share of the step before that got this far. Null on the first step and while collecting. */
  pct: number | null
}

export type PaymentsPanel =
  | Paused | Collecting
  | { status: 'ready'; paid: number; within30Pct: number; medianDays: number }

export type SupportPanel =
  | Paused | Collecting
  | { status: 'ready'; requests: number; medianReplyMinutes: number | null; solvedAlonePct: number | null }

export interface Panels {
  usage: UsagePanel
  staff: StaffPanel
  funnel: FunnelPanel
  payments: PaymentsPanel
  support: SupportPanel
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function usagePanel(d: AnalyticsData): UsagePanel {
  if (d.live_clinics === 0) return { status: 'collecting', have: 0, need: 1, unit: 'clinics' }
  const weeks = d.weeks ?? []
  const withVisits = weeks.filter((w) => w.visits > 0)
  if (withVisits.length < NEED.usageWeeks) {
    return { status: 'collecting', have: withVisits.length, need: NEED.usageWeeks, unit: 'weeks' }
  }
  let quiet = 0
  for (let i = weeks.length - 1; i >= 0 && weeks[i].visits === 0; i--) quiet++
  if (quiet >= NEED.usageQuietWeeks) {
    return { status: 'stale', quietWeeks: quiet, lastWeekWithVisits: withVisits[withVisits.length - 1]?.week ?? null }
  }
  // Start the chart at the first week that has visits, so a new office is not shown weeks of nothing.
  const from = weeks.findIndex((w) => w.visits > 0)
  const shown = weeks.slice(from)
  const recent = shown.slice(-4)
  const before = shown.slice(-8, -4)
  const comparable = shown.length >= NEED.trendWeeks && mean(before.map((w) => w.visits)) > 0
  return {
    status: 'ready',
    weeks: shown,
    lastWeek: shown[shown.length - 1].visits,
    trendPct: comparable
      ? Math.round((mean(recent.map((w) => w.visits)) / mean(before.map((w) => w.visits)) - 1) * 100)
      : null,
    moreClinicsReporting: shown[shown.length - 1].clinics > shown[0].clinics,
  }
}

export function staffPanel(d: AnalyticsData, now: number): StaffPanel {
  if (d.live_clinics === 0) return { status: 'collecting', have: 0, need: 1, unit: 'clinics' }
  const s = d.staff
  if (!s || s.with_account < NEED.staffAccounts) {
    return { status: 'collecting', have: s?.with_account ?? 0, need: NEED.staffAccounts, unit: 'accounts' }
  }
  const ageDays = s.as_of ? (now - new Date(s.as_of).getTime()) / 86_400_000 : Infinity
  if (ageDays > NEED.staffFreshDays) return { status: 'stale', asOf: s.as_of }
  // A person can be active without finishing training, so cap at the total.
  const active = Math.min(s.active_7d, s.with_account)
  return { status: 'ready', active, total: s.with_account, idle: s.with_account - active, pct: pct(active, s.with_account) }
}

export function funnelPanel(d: AnalyticsData): FunnelPanel {
  const f = d.funnel ?? { leads: 0, contacted: 0, demo: 0, onboarding: 0, live: 0 }
  const keys: FunnelStep['key'][] = ['leads', 'contacted', 'demo', 'onboarding', 'live']
  const enough = f.leads >= NEED.funnelLeads
  const steps: FunnelStep[] = keys.map((key, i) => ({
    key, n: f[key], pct: enough && i > 0 ? pct(f[key], f[keys[i - 1]]) : null,
  }))
  if (!enough) return { status: 'collecting', have: f.leads, need: NEED.funnelLeads, unit: 'leads', steps }
  // The weakest step is only named when the step before it had enough clinics to judge.
  const judged = steps.filter((s, i) => i > 0 && steps[i - 1].n >= 5 && s.pct !== null)
  const weakest = judged.length ? judged.reduce((a, b) => ((b.pct ?? 0) < (a.pct ?? 0) ? b : a)).key : null
  const days = d.days_to_live && d.days_to_live.clinics >= 3 ? d.days_to_live.median : null
  return { status: 'ready', steps, weakest, daysToLive: days }
}

export function paymentsPanel(d: AnalyticsData): PaymentsPanel {
  const p = d.payments
  if (!p || p.paid_invoices < NEED.paidInvoices || p.median_days === null) {
    return { status: 'collecting', have: p?.paid_invoices ?? 0, need: NEED.paidInvoices, unit: 'invoices' }
  }
  return { status: 'ready', paid: p.paid_invoices, within30Pct: pct(p.within_30, p.paid_invoices), medianDays: p.median_days }
}

export function supportPanel(d: AnalyticsData): SupportPanel {
  const s = d.support
  if (!s || s.requests < NEED.supportRequests) {
    return { status: 'collecting', have: s?.requests ?? 0, need: NEED.supportRequests, unit: 'requests' }
  }
  return {
    status: 'ready',
    requests: s.requests,
    medianReplyMinutes: s.replied >= 3 ? s.median_reply_minutes : null,
    solvedAlonePct: s.solved >= 3 ? pct(s.solved_alone, s.solved) : null,
  }
}

export function panels(d: AnalyticsData, now: number): Panels {
  const off = (k: PanelKey) => d.paused.includes(k)
  return {
    usage: off('usage') ? { status: 'paused' } : usagePanel(d),
    staff: off('staff') ? { status: 'paused' } : staffPanel(d, now),
    funnel: off('funnel') ? { status: 'paused' } : funnelPanel(d),
    payments: off('payments') ? { status: 'paused' } : paymentsPanel(d),
    support: off('support') ? { status: 'paused' } : supportPanel(d),
  }
}

/** How many panels are showing real numbers. Drives the page's opening sentence. */
export function readyCount(p: Panels): number {
  return PANELS.filter((k) => p[k].status === 'ready').length
}

/** Live clinics ordered by who needs the partner first: red, amber, biggest usage drop, then name. */
export function rankClinics(rows: ClinicRow[]): ClinicRow[] {
  const weight = (r: ClinicRow) => (r.score === 'red' ? 0 : r.score === 'amber' ? 1 : r.score === 'green' ? 2 : 3)
  const ratio = (r: ClinicRow) =>
    r.baseline_visits_per_day && r.visits_per_day !== null ? r.visits_per_day / r.baseline_visits_per_day : 1
  return [...rows].sort((a, b) => weight(a) - weight(b) || ratio(a) - ratio(b) || a.name.localeCompare(b.name))
}
