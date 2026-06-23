import { createServiceClient } from '@/lib/supabase'

/** One unfinalized visit row from `rpc_unfinalized_visits`. */
export type UnfinalizedVisitRow = {
  visit_id: string
  patient_id: string
  patient_name: string | null
  patient_number: number | null
  visit_date: string
  doctor_id: string | null
  doctor_name: string | null
  status: string
  has_diagnosis: boolean
}

/** Unfinalized visit enriched with patient demographic gaps for HMIS reporting. */
export type ReviewNotesVisit = UnfinalizedVisitRow & {
  missing_sex: boolean
  missing_age: boolean
}

export type UncodedVisitRow = {
  visit_id: string
  visit_date: string
  patient_name: string | null
}

export function monthToDateRange(): { from: string; to: string } {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}

export async function fetchUnfinalizedVisits(
  clinicId: string,
  from: string,
  to: string,
): Promise<UnfinalizedVisitRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_unfinalized_visits', {
    p_clinic_id: clinicId,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('review-notes: unfinalized', error)
    return []
  }
  return (data ?? []) as UnfinalizedVisitRow[]
}

export async function countUnfinalizedVisits(clinicId: string): Promise<number> {
  const { from, to } = monthToDateRange()
  const rows = await fetchUnfinalizedVisits(clinicId, from, to)
  return rows.length
}

/** Unfinalized + uncoded visits this month — drives Today dashboard stat. */
export async function countReviewNotesItems(clinicId: string): Promise<number> {
  const { unfinalized, uncoded } = await fetchReviewNotesData(clinicId)
  return unfinalized.length + uncoded.length
}

async function enrichWithDemographics(
  rows: UnfinalizedVisitRow[],
): Promise<ReviewNotesVisit[]> {
  if (rows.length === 0) return []

  const supabase = createServiceClient()
  const patientIds = [...new Set(rows.map((r) => r.patient_id))]
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, sex, dob_precision')
    .in('id', patientIds)

  if (error) {
    console.error('review-notes: patient demographics', error)
    return rows.map((r) => ({ ...r, missing_sex: false, missing_age: false }))
  }

  const byId = new Map(
    (patients ?? []).map((p) => [
      p.id as string,
      {
        missing_sex: p.sex == null,
        missing_age: p.dob_precision === 'unknown',
      },
    ]),
  )

  return rows.map((r) => {
    const gaps = byId.get(r.patient_id)
    return {
      ...r,
      missing_sex: gaps?.missing_sex ?? false,
      missing_age: gaps?.missing_age ?? false,
    }
  })
}

async function fetchUncodedVisitsThisMonth(
  clinicId: string,
  from: string,
  to: string,
): Promise<UncodedVisitRow[]> {
  const supabase = createServiceClient()
  const { data: visits, error } = await supabase
    .from('visits')
    .select('id, visit_date, patient:patients(display_name)')
    .eq('clinic_id', clinicId)
    .gte('visit_date', from)
    .lte('visit_date', to)
    .in('status', ['sent', 'completed'])
    .order('visit_date', { ascending: false })
    .limit(200)

  if (error) {
    console.error('review-notes: uncoded visits', error)
    return []
  }

  const visitList = (visits ?? []) as Array<{
    id: string
    visit_date: string
    patient: { display_name: string | null } | { display_name: string | null }[] | null
  }>
  if (visitList.length === 0) return []

  const visitIds = visitList.map((v) => v.id)
  const { data: coded } = await supabase
    .from('visit_diagnosis_codes')
    .select('visit_id')
    .in('visit_id', visitIds)
    .in('source', ['manual', 'ai_confirmed'])

  const codedIds = new Set((coded ?? []).map((c) => c.visit_id as string))

  return visitList
    .filter((v) => !codedIds.has(v.id))
    .map((v) => {
      const patient = Array.isArray(v.patient) ? v.patient[0] : v.patient
      return {
        visit_id: v.id,
        visit_date: v.visit_date,
        patient_name: patient?.display_name ?? null,
      }
    })
}

/** Visits needing sign-off or demographic/diagnosis gaps before HMIS reporting. */
export async function fetchReviewNotesData(clinicId: string): Promise<{
  unfinalized: ReviewNotesVisit[]
  uncoded: UncodedVisitRow[]
  periodLabel: string
}> {
  const { from, to } = monthToDateRange()
  const [raw, uncoded] = await Promise.all([
    fetchUnfinalizedVisits(clinicId, from, to),
    fetchUncodedVisitsThisMonth(clinicId, from, to),
  ])
  const unfinalized = await enrichWithDemographics(raw)

  const fromDate = new Date(from + 'T00:00:00')
  const periodLabel = fromDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return { unfinalized, uncoded, periodLabel }
}
