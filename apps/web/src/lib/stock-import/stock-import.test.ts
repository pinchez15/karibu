import { describe, expect, it } from 'vitest'
import {
  mapRowsByHeader,
  parseCsv,
  parseCsvLine,
  parseTsv,
  PHARMACY_COLUMN_MAP,
} from '@/lib/stock-import/csv'
import { labImportRowSchema, pharmacyImportRowSchema } from '@/lib/stock-import/schemas'

describe('parseCsvLine', () => {
  it('parses simple fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles quoted commas', () => {
    expect(parseCsvLine('"Amoxicillin, generic",AMOX,500mg')).toEqual([
      'Amoxicillin, generic',
      'AMOX',
      '500mg',
    ])
  })
})

describe('parseCsv', () => {
  it('parses multiline CSV with header', () => {
    const rows = parseCsv('name,quantity\nAmoxicillin,120\nParacetamol,50')
    expect(rows).toHaveLength(3)
    expect(rows[1][0]).toBe('Amoxicillin')
    expect(rows[1][1]).toBe('120')
  })
})

describe('parseTsv', () => {
  it('parses tab-separated paste', () => {
    const rows = parseTsv('Amoxicillin\tAMOX\t500mg\t120')
    expect(rows[0]).toEqual(['Amoxicillin', 'AMOX', '500mg', '120'])
  })
})

describe('mapRowsByHeader', () => {
  it('maps friendly pharmacy headers', () => {
    const rows = [
      ['Drug Name', 'Qty', 'Form'],
      ['Amoxicillin', '120', 'tablet'],
    ]
    const mapped = mapRowsByHeader(rows, PHARMACY_COLUMN_MAP)
    expect(mapped).toHaveLength(1)
    expect(mapped[0].name).toBe('Amoxicillin')
    expect(mapped[0].quantity).toBe('120')
    expect(mapped[0].formulation).toBe('tablet')
  })
})

describe('pharmacyImportRowSchema', () => {
  it('accepts minimal row', () => {
    const parsed = pharmacyImportRowSchema.parse({
      name: 'Amoxicillin',
      unit: 'tablets',
    })
    expect(parsed.formulation).toBe('tablet')
    expect(parsed.quantity).toBe(0)
    expect(parsed.low_at).toBe(10)
  })

  it('normalizes DD/MM/YYYY dates', () => {
    const parsed = pharmacyImportRowSchema.parse({
      name: 'Test',
      unit: 'tabs',
      expires: '31/12/2026',
    })
    expect(parsed.expires).toBe('2026-12-31')
  })
})

describe('labImportRowSchema', () => {
  it('defaults clinical aliases to consumable', () => {
    const parsed = labImportRowSchema.parse({
      name: 'Gloves',
      unit: 'boxes',
      category: 'supplies',
    })
    expect(parsed.category).toBe('consumable')
  })
})
