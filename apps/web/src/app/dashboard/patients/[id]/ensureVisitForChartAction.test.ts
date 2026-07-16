import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ensureVisitForChartAction — the visit-ensuring path behind the chart's
// Start visit / New script / Order lab actions. Contract under test:
//   1. Role gate (clinical desk + admin; lab/pharmacy stations rejected).
//   2. Today's open visit is reused — never a same-day duplicate.
//   3. Creation goes through check_in_patient with the client op id, then
//      chains start_visit_self_triage (NOT claim_patient, which requires
//      queue_status='ready_for_doctor' and always fails on a fresh check-in).
//   4. A failed self-triage claim is non-fatal.

// React's `cache` (used by loadPatientForStaff) only exists in the server
// build — shim it as a passthrough under jsdom.
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

// Table-keyed query results: loadPatientForStaff reads `patients`, the
// active-visit lookup reads `visits`. Both chains end in maybeSingle().
const tableRows: Record<string, unknown> = { patients: null, visits: null }
const rpcMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'gte', 'order', 'limit']) {
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

import { ensureVisitForChartAction } from './actions'

const DOCTOR = { id: 'staff-1', clinic_id: 'clinic-1', role: 'doctor' }

function rpcCallNames(): string[] {
  return rpcMock.mock.calls.map((c) => c[0] as string)
}

describe('ensureVisitForChartAction', () => {
  beforeEach(() => {
    getStaff.mockReset().mockResolvedValue(DOCTOR)
    tableRows.patients = { id: 'patient-1', clinic_id: 'clinic-1' }
    tableRows.visits = null
    rpcMock.mockReset().mockImplementation((name: string) => {
      if (name === 'check_in_patient') {
        return Promise.resolve({ data: 'visit-new', error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects lab/pharmacy station roles', async () => {
    getStaff.mockResolvedValue({ ...DOCTOR, role: 'dispenser' })

    const result = await ensureVisitForChartAction({ patient_id: 'patient-1' })

    expect(result).toEqual({ success: false, error: 'Your role cannot start visits.' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects when the patient is not in the caller clinic', async () => {
    tableRows.patients = null

    const result = await ensureVisitForChartAction({ patient_id: 'patient-x' })

    expect(result).toEqual({ success: false, error: 'Patient not found' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("reuses today's open visit instead of creating a duplicate", async () => {
    tableRows.visits = {
      id: 'visit-today',
      status: 'pending',
      pharmacy_order_submitted_at: '2026-07-16T08:00:00Z',
    }

    const result = await ensureVisitForChartAction({ patient_id: 'patient-1' })

    expect(result).toEqual({
      success: true,
      visitId: 'visit-today',
      created: false,
      claimed: false,
      pharmacyOrderSubmitted: true,
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('creates via check_in_patient (with the client op id) and claims via start_visit_self_triage', async () => {
    const result = await ensureVisitForChartAction({
      patient_id: 'patient-1',
      client_op_id: 'op-123',
    })

    expect(result).toEqual({
      success: true,
      visitId: 'visit-new',
      created: true,
      claimed: true,
      pharmacyOrderSubmitted: false,
    })
    expect(rpcCallNames()).toEqual(['check_in_patient', 'start_visit_self_triage'])
    expect(rpcMock).toHaveBeenCalledWith(
      'check_in_patient',
      expect.objectContaining({
        p_clinic_id: 'clinic-1',
        p_patient_id: 'patient-1',
        p_staff_id: 'staff-1',
        p_department: 'opd',
        p_client_op_id: 'op-123',
      }),
    )
    expect(rpcMock).toHaveBeenCalledWith('start_visit_self_triage', {
      p_visit_id: 'visit-new',
      p_clinician_id: 'staff-1',
    })
  })

  it('skips the self-triage claim for roles outside its allowlist (visit stays in Waiting)', async () => {
    getStaff.mockResolvedValue({ ...DOCTOR, role: 'records_officer' })

    const result = await ensureVisitForChartAction({ patient_id: 'patient-1' })

    expect(result).toEqual({
      success: true,
      visitId: 'visit-new',
      created: true,
      claimed: false,
      pharmacyOrderSubmitted: false,
    })
    expect(rpcCallNames()).toEqual(['check_in_patient'])
  })

  it('still succeeds (claimed=false) when self-triage fails, e.g. a nurse got there first', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'check_in_patient') {
        return Promise.resolve({ data: 'visit-new', error: null })
      }
      return Promise.resolve({
        data: null,
        error: { message: 'Visit not in waiting status (cannot self-triage)' },
      })
    })

    const result = await ensureVisitForChartAction({ patient_id: 'patient-1' })

    expect(result).toEqual({
      success: true,
      visitId: 'visit-new',
      created: true,
      claimed: false,
      pharmacyOrderSubmitted: false,
    })
  })

  it('surfaces a check-in failure as an error result', async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'Patient not found in this clinic' } }),
    )

    const result = await ensureVisitForChartAction({ patient_id: 'patient-1' })

    expect(result).toEqual({
      success: false,
      error: 'Patient not found in this clinic',
    })
  })
})
