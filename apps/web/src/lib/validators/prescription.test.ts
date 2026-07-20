import { describe, expect, it } from 'vitest'
import {
  aggregateDispensingStatus,
  pharmacyTabForVisit,
  PrescriptionLineInputSchema,
} from '@/lib/validators/prescription'

describe('PrescriptionLineInputSchema — §0 AI-source gate', () => {
  it('accepts a structured manual line', () => {
    const parsed = PrescriptionLineInputSchema.parse({
      medication_code: 'AMOX',
      dose_amount: 500,
      dose_unit: 'mg',
      strength_amount: 500,
      frequency_code: 'TID',
      duration_days: 7,
      order_mode: 'scheduled',
      dispense_unit: 'cap',
      quantity_prescribed: 21,
      quantity_source: 'computed',
      source: 'manual',
    })
    expect(parsed.frequency_code).toBe('TID')
    expect(parsed.source).toBe('manual')
  })

  it('throws when source is ai_suggested', () => {
    expect(() =>
      PrescriptionLineInputSchema.parse({
        medication_code: 'PARA',
        dose_amount: 1,
        dose_unit: 'tab',
        source: 'ai_suggested',
      }),
    ).toThrow()
  })

  it('throws when source is manual_confirmed', () => {
    expect(() =>
      PrescriptionLineInputSchema.parse({
        medication_code: 'PARA',
        source: 'manual_confirmed',
      }),
    ).toThrow()
  })

  it('rejects a non-integer duration', () => {
    expect(() =>
      PrescriptionLineInputSchema.parse({
        medication_code: 'PARA',
        duration_days: 5.5,
        source: 'manual',
      }),
    ).toThrow()
  })

  it('rejects an unknown dose_unit', () => {
    expect(() =>
      PrescriptionLineInputSchema.parse({
        medication_code: 'PARA',
        dose_unit: 'teaspoon',
        source: 'manual',
      }),
    ).toThrow()
  })
})

describe('aggregateDispensingStatus', () => {
  it('returns dispensed when all lines dispensed', () => {
    expect(aggregateDispensingStatus(['dispensed', 'dispensed'])).toBe('dispensed')
  })

  it('returns partial when mixed terminal outcomes', () => {
    expect(aggregateDispensingStatus(['dispensed', 'out_of_stock'])).toBe('partial')
  })

  it('returns not_started when all lines need clarification', () => {
    expect(aggregateDispensingStatus(['needs_clarification', 'needs_clarification'])).toBe(
      'not_started',
    )
  })

  it('returns in_progress when one line sent back and others still open', () => {
    expect(aggregateDispensingStatus(['needs_clarification', 'ordered'])).toBe('in_progress')
  })

  it('returns in_progress while lines still open', () => {
    expect(aggregateDispensingStatus(['ordered', 'dispensing'])).toBe('in_progress')
  })

  it('returns in_progress when first med of a multi-line Rx is dispensed', () => {
    expect(aggregateDispensingStatus(['dispensed', 'ordered'])).toBe('in_progress')
  })

  it('returns in_progress when a line is partially dispensed but others remain open', () => {
    expect(aggregateDispensingStatus(['partially_dispensed', 'ordered'])).toBe('in_progress')
  })

  it('returns partial when a balance remains and no lines are still open', () => {
    expect(aggregateDispensingStatus(['partially_dispensed'])).toBe('partial')
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
