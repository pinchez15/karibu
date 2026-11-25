// What the office's book of clinics is worth, worked out from the clinic list
// and the country price book. Pure functions: no database, no clock.
import { PRICE_BOOKS, type CountryCode } from '@karibu/shared'
import type { ClinicAccount, ClinicStage } from './types'

export const SALES_STAGES: ClinicStage[] = ['lead', 'contacted', 'demo']
export const ONBOARDING_STAGES: ClinicStage[] = ['readiness', 'configured', 'trained', 'kit_delivered']
export const LIVE_STAGES: ClinicStage[] = ['live', 'steady', 'billed']

export type Group = 'sales' | 'onboarding' | 'live' | 'lost'

export function groupOf(stage: ClinicStage): Group {
  if (SALES_STAGES.includes(stage)) return 'sales'
  if (ONBOARDING_STAGES.includes(stage)) return 'onboarding'
  if (LIVE_STAGES.includes(stage)) return 'live'
  return 'lost'
}

/** Monthly price of a clinic's plan in local currency. Null until a plan is chosen. */
export function monthlyValue(clinic: Pick<ClinicAccount, 'tier'>, country: CountryCode): number | null {
  return clinic.tier ? PRICE_BOOKS[country].monthly[clinic.tier] : null
}

export interface Portfolio {
  live: ClinicAccount[]
  onboarding: ClinicAccount[]
  sales: ClinicAccount[]
  /** Monthly subscription value of live clinics that have a plan. */
  mrr: number
  /** Live clinics with no plan set: their value is missing from mrr. */
  liveWithoutPlan: number
  health: { green: number; amber: number; red: number; unknown: number }
  /** Monthly value of everything in sales and onboarding if all of it goes live. */
  pipelineValue: number
  pipelineWithoutPlan: number
  /** Clinics whose next step has a date that has passed. */
  followUpsOverdue: ClinicAccount[]
}

export function portfolio(clinics: ClinicAccount[], country: CountryCode, now: number): Portfolio {
  const by = (g: Group) => clinics.filter((c) => groupOf(c.stage) === g)
  const live = by('live')
  const onboarding = by('onboarding')
  const sales = by('sales')
  const open = [...sales, ...onboarding]
  const sum = (list: ClinicAccount[]) => list.reduce((total, c) => total + (monthlyValue(c, country) ?? 0), 0)
  const health = { green: 0, amber: 0, red: 0, unknown: 0 }
  for (const c of live) health[c.health?.score ?? 'unknown'] += 1
  return {
    live, onboarding, sales,
    mrr: sum(live),
    liveWithoutPlan: live.filter((c) => !c.tier).length,
    health,
    pipelineValue: sum(open),
    pipelineWithoutPlan: open.filter((c) => !c.tier).length,
    followUpsOverdue: open.filter((c) => c.next_action_at && new Date(c.next_action_at).getTime() < now),
  }
}

/** Whole days a follow-up is late, or 0 when it is not late or has no date. */
export function daysLate(iso: string | null, now: number): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000))
}
