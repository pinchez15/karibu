import { describe, it, expect, vi, beforeEach } from 'vitest'

// Retired patients (migration 111) must be invisible to the shared patient
// search that powers every picker (check-in, ANC, HIV/TB, inpatient admit,
// calendar, retire-dialog merge target). The service client is mocked with a
// call-recording builder so the test pins the exact filter shape.

const getStaff = vi.fn()
vi.mock('@/lib/auth', () => ({
  getStaff: () => getStaff(),
}))
vi.mock('@/lib/onboarding-server', () => ({
  ensureCanRegisterPatients: () => ({}),
}))
vi.mock('@/lib/realtime-server', () => ({
  broadcastClinicRefresh: vi.fn().mockResolvedValue(undefined),
}))

type BuilderCall = { method: string; args: unknown[] }
const builderCalls: BuilderCall[] = []
let queryResult: { data: unknown; error: unknown } = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'is', 'or', 'ilike', 'order', 'range']) {
        builder[m] = (...args: unknown[]) => {
          builderCalls.push({ method: m, args })
          return builder
        }
      }
      builder.limit = (...args: unknown[]) => {
        builderCalls.push({ method: 'limit', args })
        return Promise.resolve(queryResult)
      }
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
      builder.single = () => Promise.resolve({ data: null, error: null })
      return builder
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

import { searchPatients } from './actions'

describe('searchPatients — retired patients are hidden', () => {
  beforeEach(() => {
    getStaff.mockReset().mockResolvedValue({
      id: 'staff-1',
      clinic_id: 'clinic-1',
      role: 'records_officer',
    })
    builderCalls.length = 0
    queryResult = {
      data: [{ id: 'patient-active', first_name: 'Grace', last_name: 'Auma' }],
      error: null,
    }
  })

  it('applies the retired_at IS NULL filter alongside clinic scoping', async () => {
    const results = await searchPatients('gra')

    expect(results).toHaveLength(1)
    expect(builderCalls).toContainEqual({
      method: 'eq',
      args: ['clinic_id', 'clinic-1'],
    })
    expect(builderCalls).toContainEqual({
      method: 'is',
      args: ['retired_at', null],
    })
  })

  it('still short-circuits without hitting the database for short queries', async () => {
    const results = await searchPatients('g')

    expect(results).toEqual([])
    expect(builderCalls).toHaveLength(0)
  })
})
