import { describe, expect, it } from 'vitest'
import { aggregateDispensingStatus, pharmacyTabForVisit } from '@/lib/validators/prescription'

describe('aggregateDispensingStatus', () => {
  it('returns dispensed when all lines dispensed', () => {
    expect(aggregateDispensingStatus(['dispensed', 'dispensed'])).toBe('dispensed')
  })

  it('returns partial when mixed terminal outcomes', () => {
    expect(aggregateDispensingStatus(['dispensed', 'out_of_stock'])).toBe('partial')
  })

  it('returns not_started when clarification needed', () => {
    expect(aggregateDispensingStatus(['needs_clarification', 'ordered'])).toBe('not_started')
  })

  it('returns in_progress while lines still open', () => {
    expect(aggregateDispensingStatus(['ordered', 'dispensing'])).toBe('in_progress')
  })
})

describe('pharmacyTabForVisit', () => {
  it('keeps partial visits in the in progress tab', () => {
    expect(pharmacyTabForVisit('partial', '2026-07-02T10:00:00Z')).toBe('in_progress')
  })

  it('moves fully dispensed visits to done today', () => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    expect(pharmacyTabForVisit('dispensed', today.toISOString())).toBe('done_today')
  })
})
