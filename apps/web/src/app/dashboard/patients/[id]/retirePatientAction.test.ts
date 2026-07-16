import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// retirePatient — the admin-only soft-retire server action (migration 111).
// Contract under test:
//   1. Admin-only role gate (checked before any DB work).
//   2. Reason required; self-merge rejected client-side.
//   3. Clinic-scoped patient lookup (cross-clinic → Patient not found).
//   4. The retire_patient RPC receives the acting staff id (p_retired_by)
//      and an idempotency op id; RPC errors (open visit today, retired merge
//      target, …) surface verbatim.

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

const getStaff = vi.fn()
vi.mock('@/lib/auth', () => ({
  getStaff: () => getStaff(),
}))

vi.mock('@/lib/onboarding-server', () => ({
  ensureCanRegisterPatients: () => ({}),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/realtime-server', () => ({
  broadcastClinicRefresh: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/chart-access-log', () => ({ logChartAccess: vi.fn() }))
vi.mock('@/lib/sync-critical-alerts', () => ({
  syncCriticalAlertsForVisit: vi.fn(),
}))
vi.mock('@/lib/server-timing', () => ({
  measureServerLoader: (_name: string, fn: () => unknown) => fn(),
  PERF_LOADER: new Proxy({}, { get: () => 'perf' }),
}))

const tableRows: Record<string, unknown> = { patients: null }
const rpcMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'order', 'limit']) {
        builder[m] = vi.fn(() => builder)
      }
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: tableRows[table] ?? null, error: null }),
      )
      return builder
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}))

import { retirePatient } from './actions'

const ADMIN = { id: 'staff-admin', clinic_id: 'clinic-1', role: 'admin' }

describe('retirePatient', () => {
  beforeEach(() => {
    getStaff.mockReset().mockResolvedValue(ADMIN)
    tableRows.patients = { id: 'patient-dup', clinic_id: 'clinic-1', retired_at: null }
    rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects non-admin roles before touching the database', async () => {
    getStaff.mockResolvedValue({ ...ADMIN, role: 'doctor' })

    const result = await retirePatient({ patient_id: 'patient-dup', reason: 'Dup' })

    expect(result).toEqual({
      success: false,
      error: 'Only an admin can retire a patient record.',
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('requires a non-blank reason', async () => {
    const result = await retirePatient({ patient_id: 'patient-dup', reason: '   ' })

    expect(result).toEqual({
      success: false,
      error: 'A reason is required to retire a patient.',
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('refuses to merge a record into itself', async () => {
    const result = await retirePatient({
      patient_id: 'patient-dup',
      reason: 'Dup',
      merged_into_patient_id: 'patient-dup',
    })

    expect(result).toEqual({
      success: false,
      error: 'A record cannot be merged into itself.',
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects patients outside the caller clinic', async () => {
    tableRows.patients = null

    const result = await retirePatient({ patient_id: 'patient-x', reason: 'Dup' })

    expect(result).toEqual({ success: false, error: 'Patient not found' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls retire_patient with the acting admin id and an idempotency op id', async () => {
    const result = await retirePatient({
      patient_id: 'patient-dup',
      reason: '  Registered twice on 14 Jul  ',
      merged_into_patient_id: 'patient-survivor',
      client_op_id: 'op-retire-1',
    })

    expect(result).toEqual({ success: true })
    expect(rpcMock).toHaveBeenCalledWith('retire_patient', {
      p_patient_id: 'patient-dup',
      p_reason: 'Registered twice on 14 Jul',
      p_merged_into: 'patient-survivor',
      p_client_op_id: 'op-retire-1',
      p_retired_by: 'staff-admin',
    })
  })

  it('generates a client op id when the caller does not supply one', async () => {
    await retirePatient({ patient_id: 'patient-dup', reason: 'Dup' })

    expect(rpcMock).toHaveBeenCalledWith(
      'retire_patient',
      expect.objectContaining({
        p_client_op_id: expect.any(String),
        p_merged_into: null,
      }),
    )
  })

  it('surfaces RPC refusals (e.g. open visit today) verbatim', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message:
          'Patient has an open visit today — complete or cancel it before retiring',
      },
    })

    const result = await retirePatient({ patient_id: 'patient-dup', reason: 'Dup' })

    expect(result).toEqual({
      success: false,
      error:
        'Patient has an open visit today — complete or cancel it before retiring',
    })
  })
})
