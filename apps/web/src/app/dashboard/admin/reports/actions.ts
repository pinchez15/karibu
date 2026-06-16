'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff, isAdmin, isSuperadmin } from '@/lib/auth'
import type {
  Hmis105Row,
  DataQualityStats,
  ClinicOption,
} from '@karibu/shared'
import type {
  DataQualityStatsEx,
  Hmis105ReportEx,
  Hmis105SingleReportEx,
  Hmis105MultiReportEx,
  Hmis105ReportFailure,
} from './hmis105/report-types'

// PostgREST silently caps un-ranged selects at 1000 rows; a real HC III month
// exceeds that, so every visit fetch below paginates explicitly.
const VISIT_PAGE_SIZE = 1000
// Chunk size for `.in(...)` filters: ids travel in the query string, and
// 1000+ UUIDs overflow URL limits with an error the old code swallowed.
const ID_CHUNK_SIZE = 200

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Mirrors migration 038's age derivation exactly: a patient is HMIS-bandable
 * when dob_precision provides a usable source (exact DOB, birth year, or
 * approximate age + recording date). Only patients whose age cannot be
 * derived at all count as "missing".
 */
function canDeriveAge(p: {
  dob_precision: string | null
  date_of_birth: string | null
  birth_year: number | null
  approximate_age: number | null
  age_recorded_at: string | null
}): boolean {
  if (p.dob_precision === 'exact' && p.date_of_birth !== null) return true
  if (p.dob_precision === 'year_only' && p.birth_year !== null) return true
  if (
    p.dob_precision === 'age_estimate' &&
    p.approximate_age !== null &&
    p.age_recorded_at !== null
  ) {
    return true
  }
  return false
}

/**
 * Authorize HMIS reporting access for a set of clinics.
 * Single-clinic admins may only report on their own clinic; anything that
 * touches another clinic requires a platform superadmin.
 */
async function authorizeHmisAccess(clinicIds: string[]): Promise<
  | { staffClinicId: string; error?: undefined }
  | { staffClinicId?: undefined; error: string }
> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { error: 'Admin access required' }

  const crossClinic = clinicIds.some((id) => id !== staff.clinic_id)
  if (crossClinic) {
    const superadmin = await isSuperadmin()
    if (!superadmin) {
      return { error: 'Only superadmins can report on other clinics' }
    }
  }

  return { staffClinicId: staff.clinic_id }
}

export async function generateHmis105Report(
  year: number,
  month: number,
  clinicId?: string,
): Promise<{ data?: Hmis105ReportEx; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const targetClinicId = clinicId ?? staff.clinic_id

  const authz = await authorizeHmisAccess([targetClinicId])
  if (authz.error) return { error: authz.error }

  const supabase = createServiceClient()

  // Get clinic name — must be the clinic the data is generated for, so the
  // rendered/exported header can never mislabel another clinic's numbers.
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', targetClinicId)
    .single()

  if (clinicError || !clinic) {
    console.error('Failed to fetch clinic for HMIS 105:', clinicError)
    return { error: 'Clinic not found' }
  }

  // Call the aggregation function
  const { data: rows, error } = await supabase.rpc('generate_hmis_105', {
    p_clinic_id: targetClinicId,
    p_year: year,
    p_month: month,
  })

  if (error) {
    console.error('Failed to generate HMIS 105:', error)
    return { error: 'Failed to generate report' }
  }

  // Get data quality stats for this period
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  let quality: DataQualityStatsEx
  try {
    quality = await getDataQualityStatsForPeriod(
      targetClinicId,
      periodStart,
      periodEnd,
    )
  } catch (e) {
    console.error('Failed to compute HMIS 105 data quality stats:', e)
    return { error: 'Failed to compute data quality stats' }
  }

  return {
    data: {
      clinic_id: targetClinicId,
      clinic_name: clinic.name,
      year,
      month,
      generated_at: new Date().toISOString(),
      rows: (rows || []) as Hmis105Row[],
      quality,
    },
  }
}

/**
 * Period data quality stats. Throws on any query error — callers must treat
 * a failure as a failed clinic-month, never as "all zeros".
 */
async function getDataQualityStatsForPeriod(
  clinicId: string,
  periodStart: string,
  periodEnd: string,
): Promise<DataQualityStatsEx> {
  const supabase = createServiceClient()

  // All finalized visits in the period, paginated past PostgREST's 1000-row cap.
  const periodVisits: Array<{ id: string; patient_id: string }> = []
  for (let from = 0; ; from += VISIT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('visits')
      .select('id, patient_id')
      .eq('clinic_id', clinicId)
      .gte('visit_date', periodStart)
      .lt('visit_date', periodEnd)
      .in('status', ['sent', 'completed'])
      .order('id', { ascending: true })
      .range(from, from + VISIT_PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch period visits: ${error.message}`)
    }
    periodVisits.push(...((data || []) as Array<{ id: string; patient_id: string }>))
    if (!data || data.length < VISIT_PAGE_SIZE) break
  }

  const totalVisits = periodVisits.length

  // Visits in the period that are NOT finalized (pending/review/error).
  // These never reach the HMIS counts — surface them instead of hiding them.
  const { count: unfinalizedCount, error: unfinalizedError } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('visit_date', periodStart)
    .lt('visit_date', periodEnd)
    .in('status', ['pending', 'review', 'error'])

  if (unfinalizedError) {
    throw new Error(
      `Failed to count unfinalized visits: ${unfinalizedError.message}`,
    )
  }

  const visitIds = periodVisits.map((v) => v.id)
  const patientIds = [...new Set(periodVisits.map((v) => v.patient_id))]

  // Coded visits — chunked `.in()` to stay under URL-length limits. Counts
  // only sources that reach the MoH report (matches generate_hmis_105's
  // source filter from migration 062): unconfirmed AI suggestions don't
  // make a visit "coded".
  const uniqueCoded = new Set<string>()
  for (const ids of chunk(visitIds, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('visit_diagnosis_codes')
      .select('visit_id')
      .in('visit_id', ids)
      .in('source', ['manual', 'ai_confirmed'])

    if (error) {
      throw new Error(`Failed to fetch coded visits: ${error.message}`)
    }
    for (const c of (data || []) as Array<{ visit_id: string }>) {
      uniqueCoded.add(c.visit_id)
    }
  }
  const codedCount = uniqueCoded.size

  // Missing sex / underivable age for patients seen in this period.
  let missingSex = 0
  let missingAge = 0
  for (const ids of chunk(patientIds, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('patients')
      .select(
        'id, sex, date_of_birth, birth_year, approximate_age, age_recorded_at, dob_precision',
      )
      .in('id', ids)

    if (error) {
      throw new Error(`Failed to fetch patients: ${error.message}`)
    }
    for (const p of (data || []) as Array<{
      id: string
      sex: string | null
      date_of_birth: string | null
      birth_year: number | null
      approximate_age: number | null
      age_recorded_at: string | null
      dob_precision: string | null
    }>) {
      if (!p.sex) missingSex++
      if (!canDeriveAge(p)) missingAge++
    }
  }

  return {
    total_visits: totalVisits,
    coded_visits: codedCount,
    uncoded_visits: totalVisits - codedCount,
    missing_sex: missingSex,
    // Field name kept for the shared type; semantics are "no derivable age"
    // per migration 038 (year_only / age_estimate patients are bandable).
    missing_dob: missingAge,
    total_patients: patientIds.length,
    unfinalized_visits: unfinalizedCount || 0,
  }
}

export async function getDataQualityStats(): Promise<{
  data?: DataQualityStats & {
    patients_missing_sex: Array<{ id: string; display_name: string | null; whatsapp_number: string }>
    patients_missing_dob: Array<{ id: string; display_name: string | null; whatsapp_number: string }>
    uncoded_visit_ids: Array<{ id: string; visit_date: string; patient_name: string | null }>
  }
  error?: string
}> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { error: 'Admin access required' }

  const supabase = createServiceClient()

  // Patients missing sex
  const { data: missingSexPatients } = await supabase
    .from('patients')
    .select('id, display_name, whatsapp_number')
    .eq('clinic_id', staff.clinic_id)
    .is('sex', null)
    .order('created_at', { ascending: false })
    .limit(50)

  // Patients with no derivable age. Migration 038's consistency CHECK
  // guarantees dob_precision='unknown' is exactly the set whose age cannot
  // be derived (exact/year_only/age_estimate all require their source field).
  const { data: missingDobPatients } = await supabase
    .from('patients')
    .select('id, display_name, whatsapp_number')
    .eq('clinic_id', staff.clinic_id)
    .eq('dob_precision', 'unknown')
    .order('created_at', { ascending: false })
    .limit(50)

  // Count totals
  const { count: missingSexCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', staff.clinic_id)
    .is('sex', null)

  const { count: missingDobCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', staff.clinic_id)
    .eq('dob_precision', 'unknown')

  const { count: totalPatients } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', staff.clinic_id)

  // Finalized visits with no HMIS codes
  const { data: allFinalizedVisits } = await supabase
    .from('visits')
    .select('id, visit_date, patient:patients(display_name)')
    .eq('clinic_id', staff.clinic_id)
    .in('status', ['sent', 'completed'])
    .order('visit_date', { ascending: false })
    .limit(200)

  const finalizedIds = (allFinalizedVisits || []).map((v: { id: string }) => v.id)

  const codedIds = new Set<string>()
  for (const ids of chunk(finalizedIds, ID_CHUNK_SIZE)) {
    const { data: codedVisits } = await supabase
      .from('visit_diagnosis_codes')
      .select('visit_id')
      .in('visit_id', ids)
    for (const c of (codedVisits || []) as Array<{ visit_id: string }>) {
      codedIds.add(c.visit_id)
    }
  }

  const uncodedVisits = (allFinalizedVisits || [])
    .filter((v: { id: string }) => !codedIds.has(v.id))
    .slice(0, 50)
    .map((v: Record<string, unknown>) => {
      const patient = v.patient as { display_name: string | null } | null
      return {
        id: v.id as string,
        visit_date: v.visit_date as string,
        patient_name: patient?.display_name || null,
      }
    })

  const totalVisits = finalizedIds.length
  const codedCount = codedIds.size

  return {
    data: {
      total_visits: totalVisits,
      coded_visits: codedCount,
      uncoded_visits: totalVisits - codedCount,
      missing_sex: missingSexCount || 0,
      missing_dob: missingDobCount || 0,
      total_patients: totalPatients || 0,
      patients_missing_sex: (missingSexPatients || []) as Array<{ id: string; display_name: string | null; whatsapp_number: string }>,
      patients_missing_dob: (missingDobPatients || []) as Array<{ id: string; display_name: string | null; whatsapp_number: string }>,
      uncoded_visit_ids: uncodedVisits,
    },
  }
}

export async function fetchAllClinics(): Promise<{
  data?: ClinicOption[]
  error?: string
}> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { error: 'Admin access required' }

  const supabase = createServiceClient()

  // Single-clinic admins only ever see (and report on) their own clinic.
  // The full clinic list is a superadmin surface.
  const superadmin = await isSuperadmin()
  if (!superadmin) {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('id, name')
      .eq('id', staff.clinic_id)
      .single()

    if (error || !clinic) {
      console.error('Failed to fetch clinic:', error)
      return { error: 'Failed to fetch clinics' }
    }
    return { data: [clinic as ClinicOption] }
  }

  const { data: clinics, error } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('Failed to fetch clinics:', error)
    return { error: 'Failed to fetch clinics' }
  }

  return { data: (clinics || []) as ClinicOption[] }
}

export async function generateMultiHmis105Report(
  clinicIds: string[],
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<{ data?: Hmis105MultiReportEx; error?: string }> {
  // Validation
  if (clinicIds.length === 0) return { error: 'Select at least one clinic' }
  if (clinicIds.length > 50) return { error: 'Maximum 50 clinics allowed' }

  const authz = await authorizeHmisAccess(clinicIds)
  if (authz.error) return { error: authz.error }

  // Build (year, month) pairs
  const monthPairs: { year: number; month: number }[] = []
  let y = startYear
  let m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    monthPairs.push({ year: y, month: m })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  if (monthPairs.length === 0) return { error: 'Invalid date range' }
  if (monthPairs.length > 12) return { error: 'Maximum 12 months allowed' }

  const totalCalls = clinicIds.length * monthPairs.length
  if (totalCalls > 600) return { error: 'Too many report combinations (max 600)' }

  const supabase = createServiceClient()

  // Fetch clinic names
  const { data: clinicsData, error: clinicsError } = await supabase
    .from('clinics')
    .select('id, name')
    .in('id', clinicIds)

  if (clinicsError) {
    console.error('Failed to fetch clinics:', clinicsError)
    return { error: 'Failed to fetch clinic details' }
  }

  const clinicMap = new Map(
    (clinicsData || []).map((c: { id: string; name: string }) => [c.id, c.name]),
  )
  const clinics: ClinicOption[] = clinicIds.map((id) => ({
    id,
    name: clinicMap.get(id) || 'Unknown',
  }))

  // Generate all reports in parallel. Failures are collected, never dropped:
  // a clinic-month that fails must surface as "incomplete", not as zeros.
  type ClinicMonthResult =
    | { ok: true; report: Hmis105SingleReportEx }
    | { ok: false; failure: Hmis105ReportFailure }

  const reportPromises: Promise<ClinicMonthResult>[] = clinicIds.flatMap(
    (clinicId) =>
      monthPairs.map(async ({ year, month }): Promise<ClinicMonthResult> => {
        const clinicName = clinicMap.get(clinicId) || 'Unknown'

        const { data: rows, error: rpcError } = await supabase.rpc(
          'generate_hmis_105',
          {
            p_clinic_id: clinicId,
            p_year: year,
            p_month: month,
          },
        )

        if (rpcError) {
          console.error(
            `HMIS 105 RPC failed for clinic=${clinicId} ${year}-${month}:`,
            rpcError,
          )
          return {
            ok: false,
            failure: {
              clinic_id: clinicId,
              clinic_name: clinicName,
              year,
              month,
              error: rpcError.message || 'Report generation failed',
            },
          }
        }

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

        try {
          const quality = await getDataQualityStatsForPeriod(
            clinicId,
            periodStart,
            periodEnd,
          )

          return {
            ok: true,
            report: {
              clinic_id: clinicId,
              clinic_name: clinicName,
              year,
              month,
              rows: (rows || []) as Hmis105Row[],
              quality,
            },
          }
        } catch (e) {
          console.error(
            `HMIS 105 quality stats failed for clinic=${clinicId} ${year}-${month}:`,
            e,
          )
          return {
            ok: false,
            failure: {
              clinic_id: clinicId,
              clinic_name: clinicName,
              year,
              month,
              error:
                e instanceof Error ? e.message : 'Data quality query failed',
            },
          }
        }
      }),
  )

  const results = await Promise.all(reportPromises)
  const reports = results
    .filter((r): r is { ok: true; report: Hmis105SingleReportEx } => r.ok)
    .map((r) => r.report)
  const failures = results
    .filter((r): r is { ok: false; failure: Hmis105ReportFailure } => !r.ok)
    .map((r) => r.failure)

  // Aggregate quality stats
  const aggregated_quality: DataQualityStatsEx = {
    total_visits: 0,
    coded_visits: 0,
    uncoded_visits: 0,
    missing_sex: 0,
    missing_dob: 0,
    total_patients: 0,
    unfinalized_visits: 0,
  }
  for (const r of reports) {
    aggregated_quality.total_visits += r.quality.total_visits
    aggregated_quality.coded_visits += r.quality.coded_visits
    aggregated_quality.uncoded_visits += r.quality.uncoded_visits
    aggregated_quality.missing_sex += r.quality.missing_sex
    aggregated_quality.missing_dob += r.quality.missing_dob
    aggregated_quality.total_patients += r.quality.total_patients
    aggregated_quality.unfinalized_visits += r.quality.unfinalized_visits
  }

  return {
    data: {
      reports,
      failures,
      clinics,
      date_range: {
        start_year: startYear,
        start_month: startMonth,
        end_year: endYear,
        end_month: endMonth,
      },
      aggregated_quality,
      generated_at: new Date().toISOString(),
    },
  }
}
