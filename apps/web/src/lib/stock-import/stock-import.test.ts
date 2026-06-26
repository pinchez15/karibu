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
    expect(parsed.unit_price_ugx).toBeNull()
  })

  it('parses unit_price as UGX integer', () => {
    const parsed = pharmacyImportRowSchema.parse({
      name: 'Metronidazole',
      unit: 'vials',
      unit_price: '5000',
    })
    expect(parsed.unit_price_ugx).toBe(5000)
  })

  it('merges brand_generic into notes', () => {
    const parsed = pharmacyImportRowSchema.parse({
      name: 'Metronidazole',
      unit: 'vials',
      brand_generic: 'Flagyl',
      notes: 'Injectable',
    })
    expect(parsed.notes).toBe('Brand: Flagyl\nInjectable')
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

  it('maps test_kit and lab_test categories', () => {
    expect(
      labImportRowSchema.parse({ name: 'PyloKit', unit: 'kits', category: 'test_kit' }).category,
    ).toBe('rdt_kit')
    expect(
      labImportRowSchema.parse({ name: 'CBC', unit: 'tests', category: 'lab_test' }).category,
    ).toBe('other')
  })

  it('parses unit_price', () => {
    const parsed = labImportRowSchema.parse({
      name: 'Malaria RDT',
      unit: 'tests',
      unit_price: '2,000',
    })
    expect(parsed.unit_price_ugx).toBe(2000)
  })
})

describe('mapRowsByHeader brand_generi alias', () => {
  it('maps truncated Excel header', () => {
    const rows = [
      ['name', 'brand_generi', 'unit_price'],
      ['Metronidazole', 'Flagyl', '5000'],
    ]
    const mapped = mapRowsByHeader(rows, PHARMACY_COLUMN_MAP)
    expect(mapped[0].brand_generic).toBe('Flagyl')
    expect(mapped[0].unit_price).toBe('5000')
  })
})
