import { describe, expect, it } from 'vitest'
import { evaluateCriticalAlerts, tierFor } from './critical-alert-rules'

function dobYears(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function dobMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

describe('critical-alert-rules', () => {
  it('returns empty when vitals are null', () => {
    expect(evaluateCriticalAlerts({ dateOfBirth: dobYears(2) }, null)).toEqual([])
  })

  it('flags hypoxia below 90%', () => {
    const alerts = evaluateCriticalAlerts(
      { dateOfBirth: dobYears(30) },
      { spo2_pct: 88 },
    )
    expect(alerts.map((a) => a.ruleSlug)).toContain('hypoxia')
    expect(alerts.find((a) => a.ruleSlug === 'hypoxia')?.tier).toBe('critical')
  })

  it('flags infant high fever as confirm tier', () => {
    const alerts = evaluateCriticalAlerts(
      { dateOfBirth: dobMonths(6) },
      { temp_c: 39.5 },
    )
    expect(alerts.map((a) => a.ruleSlug)).toContain('infant_high_fever')
    expect(tierFor('infant_high_fever')).toBe('confirm')
  })

  it('assigns critical tier to danger-sign slugs', () => {
    expect(tierFor('hypoxia')).toBe('critical')
    expect(tierFor('hypertensive_crisis')).toBe('critical')
    expect(tierFor('infant_high_fever')).toBe('confirm')
  })

  it('evaluates multiple rules from one vitals set', () => {
    const alerts = evaluateCriticalAlerts(
      { dateOfBirth: dobYears(40) },
      { spo2_pct: 80, bp_systolic: 190, bp_diastolic: 130 },
    )
    const slugs = alerts.map((a) => a.ruleSlug)
    expect(slugs).toContain('hypoxia')
    expect(slugs).toContain('hypertensive_crisis')
    alerts.forEach((a) => expect(a.tier).toBe(tierFor(a.ruleSlug)))
  })
})
