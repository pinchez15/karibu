import { describe, expect, it } from 'vitest'
import { doseUnitForDispense, parseCatalogStrength } from './catalog-strength'

describe('parseCatalogStrength — solids', () => {
  it('parses "500mg cap"', () => {
    expect(parseCatalogStrength('500mg cap')).toEqual({
      strength_amount: 500,
      strength_unit: 'mg',
      form: 'capsule',
      dispense_unit: 'cap',
      isConcentration: false,
    })
  })

  it('parses "250mg cap"', () => {
    const p = parseCatalogStrength('250mg cap')
    expect(p.strength_amount).toBe(250)
    expect(p.dispense_unit).toBe('cap')
    expect(p.form).toBe('capsule')
  })

  it('parses "625mg tab"', () => {
    expect(parseCatalogStrength('625mg tab')).toEqual({
      strength_amount: 625,
      strength_unit: 'mg',
      form: 'tablet',
      dispense_unit: 'tab',
      isConcentration: false,
    })
  })

  it('normalizes grams to mg for "1g tab"', () => {
    const p = parseCatalogStrength('1g tab')
    expect(p.strength_amount).toBe(1000)
    expect(p.strength_unit).toBe('mg')
    expect(p.dispense_unit).toBe('tab')
  })
})

describe('parseCatalogStrength — liquids (concentration)', () => {
  it('parses "125mg/5mL susp" to a 25 mg/mL concentration', () => {
    expect(parseCatalogStrength('125mg/5mL susp')).toEqual({
      strength_amount: 25,
      strength_unit: 'mg/mL',
      form: 'suspension',
      dispense_unit: 'mL',
      isConcentration: true,
    })
  })

  it('parses "228mg/5mL susp" to 45.6 mg/mL', () => {
    const p = parseCatalogStrength('228mg/5mL susp')
    expect(p.strength_amount).toBeCloseTo(45.6, 3)
    expect(p.isConcentration).toBe(true)
    expect(p.dispense_unit).toBe('mL')
  })

  it('parses "240mg/5mL susp" to 48 mg/mL', () => {
    expect(parseCatalogStrength('240mg/5mL susp').strength_amount).toBe(48)
  })

  it('treats an implicit "/mL" as per 1 mL ("10IU/mL")', () => {
    const p = parseCatalogStrength('10IU/mL')
    expect(p.strength_amount).toBe(10)
    expect(p.strength_unit).toBe('IU/mL')
    expect(p.isConcentration).toBe(true)
    expect(p.dispense_unit).toBe('mL')
  })
})

describe('parseCatalogStrength — non-mg / no-strength / combinations', () => {
  it('recovers form only from "sachet"', () => {
    const p = parseCatalogStrength('sachet')
    expect(p.strength_amount).toBeNull()
    expect(p.form).toBe('sachet')
    expect(p.dispense_unit).toBe('sachet')
  })

  it('recovers form only from "tablet"', () => {
    const p = parseCatalogStrength('tablet')
    expect(p.strength_amount).toBeNull()
    expect(p.dispense_unit).toBe('tab')
  })

  it('parses "60mg vial"', () => {
    const p = parseCatalogStrength('60mg vial')
    expect(p.strength_amount).toBe(60)
    expect(p.dispense_unit).toBe('vial')
  })

  it('parses "50% inj" keeping the % unit', () => {
    const p = parseCatalogStrength('50% inj')
    expect(p.strength_amount).toBe(50)
    expect(p.strength_unit).toBe('%')
    expect(p.form).toBe('injection')
  })

  it('leaves strength null for a combination product "20/120 mg"', () => {
    const p = parseCatalogStrength('20/120 mg')
    expect(p.strength_amount).toBeNull()
    expect(p.isConcentration).toBe(false)
  })

  it('returns all-null for empty input', () => {
    expect(parseCatalogStrength('')).toEqual({
      strength_amount: null,
      strength_unit: null,
      form: null,
      dispense_unit: null,
      isConcentration: false,
    })
  })
})

describe('doseUnitForDispense', () => {
  it('maps solids and liquids to a dose unit', () => {
    expect(doseUnitForDispense('tab')).toBe('tab')
    expect(doseUnitForDispense('cap')).toBe('cap')
    expect(doseUnitForDispense('mL')).toBe('mL')
    expect(doseUnitForDispense('bottle')).toBe('mL')
    expect(doseUnitForDispense('inhaler')).toBe('puff')
  })

  it('returns null for units with no dose-unit equivalent', () => {
    expect(doseUnitForDispense('sachet')).toBeNull()
    expect(doseUnitForDispense('vial')).toBeNull()
    expect(doseUnitForDispense(null)).toBeNull()
  })
})
