import { describe, expect, it } from 'vitest'
import { aggregateDispensingStatus } from '@/lib/validators/prescription'

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
