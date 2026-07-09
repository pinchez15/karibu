import { describe, expect, it } from 'vitest'
import {
  ageDisplay,
  capitalize,
  facilityAddressLine,
  formatDate,
  formatDateTime,
  lengthOfStayDays,
} from './print-format'

describe('print-format', () => {
  describe('lengthOfStayDays', () => {
    it('returns null while the admission is still active (no discharge date)', () => {
      expect(lengthOfStayDays('2026-07-01T08:00:00.000Z', null)).toBeNull()
    })

    it('counts the admission day as day 1', () => {
      // Same calendar day admit + discharge -> 1 day, not 0.
      expect(lengthOfStayDays('2026-07-01T08:00:00.000Z', '2026-07-01T14:00:00.000Z')).toBe(1)
    })

    it('computes whole days across a multi-day stay', () => {
      expect(lengthOfStayDays('2026-07-01T08:00:00.000Z', '2026-07-05T14:00:00.000Z')).toBe(5)
    })

    it('returns null for unparseable dates rather than NaN', () => {
      expect(lengthOfStayDays('not-a-date', '2026-07-05T00:00:00.000Z')).toBeNull()
    })
  })

  describe('facilityAddressLine', () => {
    it('joins subcounty and district when both present', () => {
      expect(
        facilityAddressLine({ name: 'X', phone: null, umdpc_number: null, district: 'Kalungu', subcounty: 'Ssunga' }),
      ).toBe('Ssunga, Kalungu')
    })

    it('returns null when neither is present', () => {
      expect(
        facilityAddressLine({ name: 'X', phone: null, umdpc_number: null, district: null, subcounty: null }),
      ).toBeNull()
    })
  })

  describe('formatDate / formatDateTime', () => {
    it('returns an em dash placeholder for null input', () => {
      expect(formatDate(null)).toBe('—')
      expect(formatDateTime(null)).toBe('—')
    })

    it('returns an em dash placeholder for unparseable input', () => {
      expect(formatDate('garbage')).toBe('—')
    })

    it('formats a valid ISO date', () => {
      expect(formatDate('2026-07-05T14:00:00.000Z')).toContain('2026')
    })
  })

  describe('ageDisplay', () => {
    it('returns an em dash for missing DOB', () => {
      expect(ageDisplay(null)).toBe('—')
    })

    it('computes age in whole years', () => {
      const twentyYearsAgo = new Date()
      twentyYearsAgo.setUTCFullYear(twentyYearsAgo.getUTCFullYear() - 20)
      const dob = twentyYearsAgo.toISOString().slice(0, 10)
      expect(ageDisplay(dob)).toBe('20y')
    })
  })

  describe('capitalize', () => {
    it('capitalizes the first letter', () => {
      expect(capitalize('recovered')).toBe('Recovered')
    })

    it('falls back to an em dash for empty/null input', () => {
      expect(capitalize(null)).toBe('—')
      expect(capitalize('')).toBe('—')
    })
  })
})
