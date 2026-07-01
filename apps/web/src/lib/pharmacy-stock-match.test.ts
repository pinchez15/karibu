import { describe, expect, it } from 'vitest'
import { matchStockForPrescription } from './pharmacy-stock-match'

const stock = [
  {
    id: '1',
    drug_code: 'AMOX',
    drug_name: 'Amoxicillin',
    strength: '250mg',
    unit: 'tabs',
    quantity_on_hand: 100,
  },
  {
    id: '2',
    drug_code: 'PCM',
    drug_name: 'Paracetamol',
    strength: '500mg',
    unit: 'tabs',
    quantity_on_hand: 50,
  },
]

describe('matchStockForPrescription', () => {
  it('matches by medication code', () => {
    const matches = matchStockForPrescription(
      { medication_code: 'AMOX', free_text_name: null },
      'Amoxicillin',
      stock,
    )
    expect(matches.map((m) => m.id)).toEqual(['1'])
  })

  it('falls back to drug name when code missing', () => {
    const matches = matchStockForPrescription(
      { medication_code: null, free_text_name: 'Paracetamol' },
      'Paracetamol',
      stock,
    )
    expect(matches.map((m) => m.id)).toEqual(['2'])
  })

  it('returns empty when nothing matches', () => {
    const matches = matchStockForPrescription(
      { medication_code: 'CIPRO', free_text_name: 'Ciprofloxacin' },
      'Ciprofloxacin',
      stock,
    )
    expect(matches).toEqual([])
  })
})
