import { createServiceClient } from '@/lib/supabase'
import {
  CLINIC_TIMEZONE,
  clinicDayEndIso,
  clinicDayStartIso,
  clinicMonthStartIso,
  clinicTodayIso,
  clinicYearStartIso,
} from '@/lib/format-clinic-date'

/** Paper-register style counts — what HC III staff track by hand. */
export type ClinicSimpleMetrics = {
  todayLabel: string
  monthLabel: string
  year: number
  today: {
    opdVisits: number
    revenueUgx: number
    admissions: number
  }
  month: {
    opdVisits: number
    admissions: number
    revenueUgx: number
    chargedUgx: number
    uniquePatients: number
  }
  yearToDate: {
    opdVisits: number
    admissions: number
    revenueUgx: number
  }
  /** Patients currently on the ward (active admissions). */
  activeInpatients: number
}

async function cashflow(
  clinicId: string,
  from: string,
  to: string,
): Promise<{ revenue: number; charged: number }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_clinic_cashflow', {
    p_clinic_id: clinicId,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('clinic-simple-metrics: cashflow', error)
    return { revenue: 0, charged: 0 }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { revenue: number; charged: number }
    | undefined
  return {
    revenue: Number(row?.revenue ?? 0),
    charged: Number(row?.charged ?? 0),
  }
}

async function countOpdVisits(
  clinicId: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('visit_date', fromDate)
    .lte('visit_date', toDate)
    .is('admission_id', null)

  if (error) {
    console.error('clinic-simple-metrics: opd visits', error)
    return 0
  }
  return count ?? 0
}

async function countAdmissions(
  clinicId: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from('admissions')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('admitted_at', fromIso)
    .lte('admitted_at', toIso)

  if (error) {
    console.error('clinic-simple-metrics: admissions', error)
    return 0
  }
  return count ?? 0
}

async function countUniqueOpdPatients(clinicId: string, fromDate: string): Promise<number> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('visits')
    .select('patient_id')
    .eq('clinic_id', clinicId)
    .gte('visit_date', fromDate)
    .is('admission_id', null)

  if (error) {
    console.error('clinic-simple-metrics: unique patients', error)
    return 0
  }
  return new Set((data ?? []).map((r) => r.patient_id)).size
}

async function countActiveInpatients(clinicId: string): Promise<number> {
  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from('admissions')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'active')

  if (error) {
    console.error('clinic-simple-metrics: active inpatients', error)
    return 0
  }
  return count ?? 0
}

export async function getClinicSimpleMetrics(clinicId: string): Promise<ClinicSimpleMetrics> {
  const now = new Date()
  const today = clinicTodayIso(now)
  const monthStart = clinicMonthStartIso(now)
  const yearStart = clinicYearStartIso(now)

  const todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CLINIC_TIMEZONE,
  }).format(now)

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: CLINIC_TIMEZONE,
  })
    .format(now)
    .toUpperCase()

  const year = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TIMEZONE, year: 'numeric' }).format(now),
  )

  const [
    todayOpd,
    monthOpd,
    ytdOpd,
    todayAdmissions,
    monthAdmissions,
    ytdAdmissions,
    todayCash,
    monthCash,
    ytdCash,
    uniquePatients,
    activeInpatients,
  ] = await Promise.all([
    countOpdVisits(clinicId, today, today),
    countOpdVisits(clinicId, monthStart, today),
    countOpdVisits(clinicId, yearStart, today),
    countAdmissions(clinicId, clinicDayStartIso(today), clinicDayEndIso(today)),
    countAdmissions(clinicId, clinicDayStartIso(monthStart), clinicDayEndIso(today)),
    countAdmissions(clinicId, clinicDayStartIso(yearStart), clinicDayEndIso(today)),
    cashflow(clinicId, today, today),
    cashflow(clinicId, monthStart, today),
    cashflow(clinicId, yearStart, today),
    countUniqueOpdPatients(clinicId, monthStart),
    countActiveInpatients(clinicId),
  ])

  return {
    todayLabel,
    monthLabel,
    year,
    today: {
      opdVisits: todayOpd,
      revenueUgx: todayCash.revenue,
      admissions: todayAdmissions,
    },
    month: {
      opdVisits: monthOpd,
      admissions: monthAdmissions,
      revenueUgx: monthCash.revenue,
      chargedUgx: monthCash.charged,
      uniquePatients,
    },
    yearToDate: {
      opdVisits: ytdOpd,
      admissions: ytdAdmissions,
      revenueUgx: ytdCash.revenue,
    },
    activeInpatients,
  }
}
