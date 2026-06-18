import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Regression test for the "Stock list unavailable: An error occurred in the
// Server Components render" bug. listClinicPharmacyStock used to (a) let an
// auth failure throw straight out of the server action (redacted to an opaque
// digest in production) and (b) destructure only `data`, silently swallowing a
// real query error into an empty list. It now returns a discriminated result
// and never throws for those two cases.

const requireStaff = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireStaff: () => requireStaff(),
}))

const queryResult: { current: { data: unknown; error: unknown } } = {
  current: { data: null, error: null },
}

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.order = vi.fn(() => Promise.resolve(queryResult.current))
    return { from: vi.fn(() => builder) }
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { listClinicPharmacyStock } from './actions'

describe('listClinicPharmacyStock', () => {
  beforeEach(() => {
    requireStaff.mockReset()
    queryResult.current = { data: null, error: null }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok with items on success', async () => {
    requireStaff.mockResolvedValue({ clinic_id: 'clinic-1' })
    const item = {
      id: 'stock-1',
      drug_name: 'Amoxicillin',
      drug_code: 'AMOX',
      strength: '500mg',
      formulation: 'capsule',
      unit: 'capsule',
      quantity_on_hand: 120,
    }
    queryResult.current = { data: [item], error: null }

    const result = await listClinicPharmacyStock()

    expect(result).toEqual({ ok: true, items: [item] })
  })

  it('returns ok:false instead of throwing when the session is unauthenticated', async () => {
    requireStaff.mockRejectedValue(new Error('Unauthorized: Staff record not found'))

    // Must not reject — a thrown server action error reaches the client as the
    // opaque production digest the user reported.
    const result = await listClinicPharmacyStock()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/session/i)
  })

  it('returns ok:false (not a silently-empty list) when the query errors', async () => {
    requireStaff.mockResolvedValue({ clinic_id: 'clinic-1' })
    queryResult.current = { data: null, error: { message: 'permission denied for table pharmacy_stock_items' } }

    const result = await listClinicPharmacyStock()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/stock list/i)
  })
})
