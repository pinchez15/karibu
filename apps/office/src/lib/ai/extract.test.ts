import { describe, expect, it } from 'vitest'
import { extractCatalog, normalizeRows } from './extract'

describe('normalizeRows', () => {
  it('cleans drug rows: digits-only prices, known formulations, no empty names', () => {
    const rows = normalizeRows('drugs', {
      rows: [
        { name: ' Paracetamol ', strength: '500mg', formulation: 'Tablet', unit_price: '1,500/=', quantity: '2,000 tabs' },
        { name: 'Cough mix', formulation: 'elixir', unit_price: 'UGX 3000.00' },
        { name: '   ', unit_price: '100' },
        'not a row',
      ],
    })
    expect(rows).toEqual([
      { name: 'Paracetamol', strength: '500mg', formulation: 'tablet', unit_price: '1500', quantity: '2000' },
      { name: 'Cough mix', strength: '', formulation: 'other', unit_price: '3000', quantity: '' },
    ])
  })

  it('maps unknown service kinds to other and survives junk', () => {
    expect(normalizeRows('services', { rows: [{ name: 'Consultation', kind: 'CONSULTATION', price: '7,000' }, { name: 'X-ray', kind: 'imaging' }] })).toEqual([
      { name: 'Consultation', kind: 'consultation', price: '7000' },
      { name: 'X-ray', kind: 'other', price: '' },
    ])
    expect(normalizeRows('drugs', null)).toEqual([])
    expect(normalizeRows('drugs', { rows: 'nope' })).toEqual([])
  })
})

describe('extractCatalog', () => {
  it('sends at most 6 images and tells the model to ignore patient names', async () => {
    let seen: { system: string; images: unknown[] } | null = null
    const provider = {
      async extractJson(args: { system: string; user: string; images: unknown[] }) {
        seen = args
        return { rows: [{ name: 'Amoxicillin', formulation: 'capsule' }] }
      },
    }
    const images = Array.from({ length: 9 }, () => ({ mime: 'image/jpeg', base64: 'x' }))
    const rows = await extractCatalog(provider, 'drugs', images)
    expect(rows).toHaveLength(1)
    expect(seen!.images).toHaveLength(6)
    expect(seen!.system).toMatch(/patient names/i)
  })
})
