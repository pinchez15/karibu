import { describe, expect, it } from 'vitest'
import { formatStockUnitPrice, patientUnitPriceFromStock } from '@/lib/money'

describe('formatStockUnitPrice', () => {
  it('formats integers with grouping', () => {
    expect(formatStockUnitPrice(3000)).toBe('3,000')
    expect(formatStockUnitPrice(5000)).toBe('5,000')
  })

  it('shows dash for missing', () => {
    expect(formatStockUnitPrice(null)).toBe('—')
  })
})

describe('patientUnitPriceFromStock', () => {
  it('applies markup percent', () => {
    expect(patientUnitPriceFromStock(5000, 10)).toBe(5500)
    expect(patientUnitPriceFromStock(3000, 10)).toBe(3300)
  })

  it('returns null when cost missing', () => {
    expect(patientUnitPriceFromStock(null, 10)).toBeNull()
  })
})
