import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispensingStatusOnTab, pharmacyTabFilter } from './pharmacy-tabs'
import { startOfTodayInTimezoneIso } from '@/lib/clinic-time'
import type { PharmacyQueueTab } from '@karibu/shared'

const ALL_TABS: PharmacyQueueTab[] = [
  'to_dispense',
  'partial',
  'returned_to_clinician',
  'done_today',
]

describe('pharmacyTabFilter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('to_dispense excludes partial (dedup) — not_started, in_progress, out_of_stock', () => {
    const filter = pharmacyTabFilter('to_dispense')
    expect(filter.statuses).toEqual(['not_started', 'in_progress', 'out_of_stock'])
    expect(filter.dispensedAfter).toBeUndefined()
  })

  it('partial filters only partial visits with no date bound', () => {
    const filter = pharmacyTabFilter('partial')
    expect(filter.statuses).toEqual(['partial'])
    expect(filter.dispensedAfter).toBeUndefined()
  })

  it('returned_to_clinician filters only returned visits', () => {
    const filter = pharmacyTabFilter('returned_to_clinician')
    expect(filter.statuses).toEqual(['returned'])
    expect(filter.dispensedAfter).toBeUndefined()
  })

  it('done_today includes only fully-dispensed, bounded by Kampala midnight', () => {
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'))
    const filter = pharmacyTabFilter('done_today')
    expect(filter.statuses).toEqual(['dispensed'])
    expect(filter.dispensedAfter).toBe(startOfTodayInTimezoneIso('Africa/Kampala'))
    expect(filter.dispensedAfter).toBe('2026-07-05T21:00:00.000Z')
  })

  it('accepts an injected dispensedAfter for deterministic queries', () => {
    const filter = pharmacyTabFilter('done_today', '2026-01-01T00:00:00.000Z')
    expect(filter.dispensedAfter).toBe('2026-01-01T00:00:00.000Z')
  })
})

// PHARM-5 queue de-dup: every dispensing_status must land on EXACTLY ONE tab.
// Before the fix `partial` and `out_of_stock` were in both ACTIVE and TERMINAL.
describe('dispensingStatusOnTab — exactly one tab', () => {
  function tabsFor(status: string): PharmacyQueueTab[] {
    return ALL_TABS.filter((tab) => dispensingStatusOnTab(tab, status))
  }

  it('a partial visit appears in exactly one tab (the Partial tab)', () => {
    expect(tabsFor('partial')).toEqual(['partial'])
  })

  it('an out_of_stock visit appears in exactly one tab (To dispense)', () => {
    expect(tabsFor('out_of_stock')).toEqual(['to_dispense'])
  })

  it('every dispensing_status maps to at most one tab', () => {
    for (const status of [
      'not_started',
      'in_progress',
      'partial',
      'out_of_stock',
      'dispensed',
      'returned',
    ]) {
      expect(tabsFor(status).length).toBeLessThanOrEqual(1)
    }
  })

  it('fully-dispensed lands only on Done today', () => {
    expect(tabsFor('dispensed')).toEqual(['done_today'])
  })

  it('not_started / in_progress land only on To dispense', () => {
    expect(tabsFor('not_started')).toEqual(['to_dispense'])
    expect(tabsFor('in_progress')).toEqual(['to_dispense'])
  })
})
