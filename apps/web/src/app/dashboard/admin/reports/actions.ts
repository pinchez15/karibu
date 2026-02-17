'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff, isAdmin } from '@/lib/auth'
import type {
  Hmis105Report,
  Hmis105Row,
  Hmis105SingleReport,
  Hmis105MultiReport,
  DataQualityStats,
  ClinicOption,
} from '@karibu/shared'

export async function generateHmis105Report(
  year: number,
  month: number,
): Promise<{ data?: Hmis105Report; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { error: 'Admin access required' }

  const supabase = createServiceClient()

  // Get clinic name
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', staff.clinic_id)
    .single()

  // Call the aggregation function
  const { data: rows, error } = await supabase.rpc('generate_hmis_105', {
    p_clinic_id: staff.clinic_id,
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

  const quality = await getDataQualityStatsForPeriod(
    staff.clinic_id,
    periodStart,
    periodEnd,
  )

  return {
    data: {
      clinic_name: clinic?.name || 'Unknown Clinic',
      year,
      month,
      generated_at: new Date().toISOString(),
      rows: (rows || []) as Hmis105Row[],
      quality,
    },
  }
}

async function getDataQualityStatsForPeriod(
  clinicId: string,
  periodStart: string,
  periodEnd: string,
): Promise<DataQualityStats> {
  const supabase = createServiceClient()

  // Total finalized visits in period
  const { count: totalVisits } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('visit_date', periodStart)
    .lt('visit_date', periodEnd)
    .in('status', ['sent', 'completed'])

  const { data: periodVisits } = await supabase
    .from('visits')
    .select('id, patient_id')
    .eq('clinic_id', clinicId)
    .gte('visit_date', periodStart)
    .lt('visit_date', periodEnd)
    .in('status', ['sent', 'completed'])

  const visitIds = (periodVisits || []).map((v: { id: string }) => v.id)
  const patientIds = [...new Set((periodVisits || []).map((v: { patient_id: string }) => v.patient_id))]

  let codedCount = 0
  if (visitIds.length > 0) {
    const { data: codedVisits } = await supabase
      .from('visit_diagnosis_codes')
      .select('visit_id')
      .in('visit_id', visitIds)

    const uniqueCoded = new Set((codedVisits || []).map((c: { visit_id: string }) => c.visit_id))
    codedCount = uniqueCoded.size
  }

  // Missing sex/DOB for patients seen in this period
  let missingSex = 0
  let missingDob = 0
  if (patientIds.length > 0) {
    const { data: patients } = await supabase
      .from('patients')
      .select('id, sex, date_of_birth')
      .in('id', patientIds)

    for (const p of patients || []) {
      if (!p.sex) missingSex++
      if (!p.date_of_birth) missingDob++
    }
  }

  return {
    total_visits: totalVisits || 0,
    coded_visits: codedCount,
    uncoded_visits: (totalVisits || 0) - codedCount,
    missing_sex: missingSex,
    missing_dob: missingDob,
    total_patients: patientIds.length,
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

  // Patients missing DOB
  const { data: missingDobPatients } = await supabase
    .from('patients')
    .select('id, display_name, whatsapp_number')
    .eq('clinic_id', staff.clinic_id)
    .is('date_of_birth', null)
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
    .is('date_of_birth', null)

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

  let codedIds = new Set<string>()
  if (finalizedIds.length > 0) {
    const { data: codedVisits } = await supabase
      .from('visit_diagnosis_codes')
      .select('visit_id')
      .in('visit_id', finalizedIds)
    codedIds = new Set((codedVisits || []).map((c: { visit_id: string }) => c.visit_id))
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
): Promise<{ data?: Hmis105MultiReport; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { error: 'Admin access required' }

  // Validation
  if (clinicIds.length === 0) return { error: 'Select at least one clinic' }
  if (clinicIds.length > 50) return { error: 'Maximum 50 clinics allowed' }

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

  // Generate all reports in parallel
  const reportPromises = clinicIds.flatMap((clinicId) =>
    monthPairs.map(async ({ year, month }) => {
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
        return null
      }

      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      const quality = await getDataQualityStatsForPeriod(
        clinicId,
        periodStart,
        periodEnd,
      )

      return {
        clinic_id: clinicId,
        clinic_name: clinicMap.get(clinicId) || 'Unknown',
        year,
        month,
        rows: (rows || []) as Hmis105Row[],
        quality,
      } as Hmis105SingleReport
    }),
  )

  const results = await Promise.all(reportPromises)
  const reports = results.filter(Boolean) as Hmis105SingleReport[]

  // Aggregate quality stats
  const aggregated_quality: DataQualityStats = {
    total_visits: 0,
    coded_visits: 0,
    uncoded_visits: 0,
    missing_sex: 0,
    missing_dob: 0,
    total_patients: 0,
  }
  for (const r of reports) {
    aggregated_quality.total_visits += r.quality.total_visits
    aggregated_quality.coded_visits += r.quality.coded_visits
    aggregated_quality.uncoded_visits += r.quality.uncoded_visits
    aggregated_quality.missing_sex += r.quality.missing_sex
    aggregated_quality.missing_dob += r.quality.missing_dob
    aggregated_quality.total_patients += r.quality.total_patients
  }

  return {
    data: {
      reports,
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
