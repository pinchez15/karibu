import { describe, expect, it } from 'vitest'
import {
  ANNUAL_MONTHS_CHARGED,
  EDITIONS,
  EXTRA_TRAINING_DAY_USD,
  LOCAL_OFFICES,
  LOCAL_PRICE_TOLERANCE,
  EDITION_IDS,
  PRICE_BOOKS,
  SETUP_USD,
  formatMoney,
  getLocalOffice,
  localAnnual,
  localPriceDrift,
  officeMonthlyRevenue,
} from './pricing'

const books = Object.values(PRICE_BOOKS)

describe('price books', () => {
  it.each(books)('$country subscription prices stay within tolerance of the USD anchor', (book) => {
    for (const id of EDITION_IDS) {
      expect(Math.abs(localPriceDrift(book.country, id))).toBeLessThanOrEqual(LOCAL_PRICE_TOLERANCE)
    }
  })

  it.each(books)('$country one-time fees stay within tolerance of the USD anchor', (book) => {
    for (const [local, usd] of [
      [book.setup, SETUP_USD],
      [book.extraTrainingDay, EXTRA_TRAINING_DAY_USD],
    ]) {
      expect(Math.abs(local / (usd * book.fxPerUsd) - 1)).toBeLessThanOrEqual(LOCAL_PRICE_TOLERANCE)
    }
  })

  it('keeps edition order in USD and local prices the same', () => {
    for (const book of books) {
      const byUsd = [...EDITION_IDS].sort((a, b) => EDITIONS[a].usdMonthly - EDITIONS[b].usdMonthly)
      const byLocal = [...EDITION_IDS].sort((a, b) => book.monthly[a] - book.monthly[b])
      expect(byLocal).toEqual(byUsd)
    }
  })

  it('only Pro is uncapped', () => {
    expect(EDITION_IDS.filter((id) => EDITIONS[id].patientLimit === null)).toEqual(['pro'])
  })

  it('charges 10 months for a year', () => {
    expect(localAnnual('UG', 'full')).toBe(PRICE_BOOKS.UG.monthly.full * ANNUAL_MONTHS_CHARGED)
    expect(localAnnual('UG', 'full')).toBe(1_300_000)
  })
})

describe('local offices', () => {
  it('every office points at a country with a price book and has a unique slug', () => {
    const slugs = LOCAL_OFFICES.map((o) => o.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const office of LOCAL_OFFICES) expect(PRICE_BOOKS[office.country]).toBeDefined()
  })

  it('finds Masaka', () => {
    expect(getLocalOffice('masaka')?.lead.firstName).toBe('Javis')
    expect(getLocalOffice('nowhere')).toBeUndefined()
  })

  it('office keeps the whole subscription', () => {
    expect(officeMonthlyRevenue('UG', { full: 5 })).toBe(650_000)
  })
})

describe('formatMoney', () => {
  it('formats with currency code and thousands separators', () => {
    expect(formatMoney(150000, 'UGX')).toBe('UGX 150,000')
  })
})
