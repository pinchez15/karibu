'use server'

import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { InpatientMonthlySummary } from './types'

type Result = { data: InpatientMonthlySummary | null; error?: string }

/**
 * B2 — monthly admission/discharge summary (HMIS 108 alignment pending
 * verification, see the reports index card label). Admissions are counted in
 * their admission month and discharges in their discharge month — a patient
 * admitted in June and discharged in July lands in both months' tallies per
 * the RPC's own rule (see rpc_inpatient_monthly_summary's comment).
 */
export async function getInpatientMonthlySummary(year: number, month: number): Promise<Result> {
  const staff = await getStaff()
  if (!staff) return { data: null, error: 'Not authenticated' }

  const allowed = await hasDataReportsAccess()
  if (!allowed) return { data: null, error: 'Data reports access required' }

  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_inpatient_monthly_summary', {
    p_clinic_id: staff.clinic_id,
    p_month: monthDate,
  })

  if (error) return { data: null, error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: 'No data returned for this month' }

  return { data: row as InpatientMonthlySummary }
}
