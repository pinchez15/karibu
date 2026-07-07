import { afterEach, describe, expect, it, vi } from 'vitest'
import { pharmacyTabFilter } from './pharmacy-data'
import { startOfTodayInTimezoneIso } from '@/lib/clinic-time'

describe('pharmacyTabFilter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('to_dispense includes the full ACTIVE set with no date bound', () => {
    const filter = pharmacyTabFilter('to_dispense')
    expect(filter.statuses).toEqual([
      'not_started',
      'in_progress',
      'partial',
      'out_of_stock',
    ])
    expect(filter.dispensedAfter).toBeUndefined()
  })

  it('returned_to_clinician filters only returned visits', () => {
    const filter = pharmacyTabFilter('returned_to_clinician')
    expect(filter.statuses).toEqual(['returned'])
    expect(filter.dispensedAfter).toBeUndefined()
  })

  it('done_today includes the TERMINAL set bounded by Kampala midnight', () => {
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'))
    const filter = pharmacyTabFilter('done_today')
    expect(filter.statuses).toEqual(['dispensed', 'partial', 'out_of_stock'])
    expect(filter.dispensedAfter).toBe(startOfTodayInTimezoneIso('Africa/Kampala'))
    expect(filter.dispensedAfter).toBe('2026-07-05T21:00:00.000Z')
  })

  it('accepts an injected dispensedAfter for deterministic queries', () => {
    const filter = pharmacyTabFilter('done_today', '2026-01-01T00:00:00.000Z')
    expect(filter.dispensedAfter).toBe('2026-01-01T00:00:00.000Z')
  })
})
