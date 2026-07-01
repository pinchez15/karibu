'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { ugandaQuarterBounds } from '@/lib/uganda-fy-quarter'
import {
  RecordHtsEventSchema,
  UpsertHivCareSchema,
  RecordViralLoadSchema,
  UpsertTbEpisodeSchema,
  RecordTptSchema,
  type RecordHtsEventInput,
  type UpsertHivCareInput,
  type RecordViralLoadInput,
  type UpsertTbEpisodeInput,
  type RecordTptInput,
} from '@/lib/validators/hiv-tb'
import type { Hmis106aQualityStats, Hmis106aReport, Hmis106aRow } from '@karibu/shared'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
])

function clinicalRoleError(role: string): string | null {
  if (!CLINICAL_ROLES.has(role)) return 'Forbidden: clinical role required'
  return null
}

export type HtsEventRow = {
  id: string
  patient_id: string
  patient_name: string | null
  event_date: string
  tested: boolean
  result: string | null
  result_received: boolean
}

export type HivCareRow = {
  id: string
  patient_id: string
  patient_name: string | null
  enrolled_at: string
  care_status: string
  who_stage: number | null
  art_start_date: string | null
  art_regimen: string | null
  art_line: string | null
  cpt_at_last_visit: boolean
  tb_assessed_last_visit: boolean
}

export type TbEpisodeRow = {
  id: string
  patient_id: string
  patient_name: string | null
  unit_tb_number: string | null
  registered_at: string
  case_type: string
  disease_class: string
  hiv_status: string | null
  treatment_started_at: string | null
  outcome: string
}

export async function loadHivTbRegistry(clinicId: string) {
  const supabase = createServiceClient()
  const [hts, hiv, tb] = await Promise.all([
    supabase.rpc('rpc_recent_hts_events', { p_clinic_id: clinicId, p_limit: 30 }),
    supabase.rpc('rpc_active_hiv_care', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_active_tb_episodes', { p_clinic_id: clinicId }),
  ])
  return {
    hts: (hts.data ?? []) as HtsEventRow[],
    hiv: (hiv.data ?? []) as HivCareRow[],
    tb: (tb.data ?? []) as TbEpisodeRow[],
  }
}

export async function recordHtsEvent(
  input: RecordHtsEventInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const staff = await requireStaff()
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = RecordHtsEventSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }

  const id = randomUUID()
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_hts_event', {
    p_id: id,
    p_patient_id: parsed.data.patient_id,
    p_event_date: parsed.data.event_date ?? null,
    p_visit_id: parsed.data.visit_id ?? null,
    p_counseled: parsed.data.counseled,
    p_tested: parsed.data.tested,
    p_result: parsed.data.result ?? null,
    p_result_received: parsed.data.result_received,
    p_first_result_in_fy: parsed.data.first_result_in_fy,
    p_suspected_tb: parsed.data.suspected_tb,
    p_started_cpt: parsed.data.started_cpt,
    p_retester: parsed.data.retester,
    p_couple_test: parsed.data.couple_test,
    p_couple_concordant: parsed.data.couple_concordant ?? null,
    p_pep: parsed.data.pep,
    p_smc_provided: parsed.data.smc_provided,
    p_pregnancy_id: parsed.data.pregnancy_id ?? null,
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/hiv-tb')
  revalidatePath(`/dashboard/patients/${parsed.data.patient_id}`)
  return { success: true, id }
}

export async function upsertHivCare(
  input: UpsertHivCareInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const staff = await requireStaff()
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = UpsertHivCareSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }

  const id = parsed.data.id ?? randomUUID()
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_upsert_hiv_care', {
    p_id: id,
    p_patient_id: parsed.data.patient_id,
    p_enrolled_at: parsed.data.enrolled_at ?? null,
    p_care_status: parsed.data.care_status,
    p_who_stage: parsed.data.who_stage ?? null,
    p_art_start_date: parsed.data.art_start_date ?? null,
    p_art_regimen: parsed.data.art_regimen ?? null,
    p_art_line: parsed.data.art_line ?? null,
    p_pregnant_at_enrollment: parsed.data.pregnant_at_enrollment,
    p_eligible_not_on_art: parsed.data.eligible_not_on_art,
    p_tb_assessed_last_visit: parsed.data.tb_assessed_last_visit,
    p_tb_treatment_started: parsed.data.tb_treatment_started,
    p_cpt_at_last_visit: parsed.data.cpt_at_last_visit,
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/hiv-tb')
  revalidatePath(`/dashboard/hiv-tb/hiv/${id}`)
  revalidatePath(`/dashboard/patients/${parsed.data.patient_id}`)
  return { success: true, id }
}

export async function recordViralLoad(
  input: RecordViralLoadInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const staff = await requireStaff()
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = RecordViralLoadSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }

  const id = randomUUID()
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_viral_load', {
    p_id: id,
    p_patient_id: parsed.data.patient_id,
    p_enrollment_id: parsed.data.enrollment_id ?? null,
    p_test_date: parsed.data.test_date ?? null,
    p_result_copies: parsed.data.result_copies ?? null,
    p_suppressed: parsed.data.suppressed ?? null,
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/hiv-tb')
  if (parsed.data.enrollment_id) {
    revalidatePath(`/dashboard/hiv-tb/hiv/${parsed.data.enrollment_id}`)
  }
  revalidatePath(`/dashboard/patients/${parsed.data.patient_id}`)
  return { success: true, id }
}

export async function upsertTbEpisode(
  input: UpsertTbEpisodeInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const staff = await requireStaff()
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = UpsertTbEpisodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }

  const id = parsed.data.id ?? randomUUID()
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_upsert_tb_episode', {
    p_id: id,
    p_patient_id: parsed.data.patient_id,
    p_unit_tb_number: parsed.data.unit_tb_number ?? null,
    p_registered_at: parsed.data.registered_at ?? null,
    p_case_type: parsed.data.case_type,
    p_disease_class: parsed.data.disease_class,
    p_ept_site: parsed.data.ept_site ?? null,
    p_hiv_status: parsed.data.hiv_status ?? null,
    p_on_art_at_diagnosis: parsed.data.on_art_at_diagnosis,
    p_on_cpt_at_diagnosis: parsed.data.on_cpt_at_diagnosis,
    p_treatment_started_at: parsed.data.treatment_started_at ?? null,
    p_regimen_category: parsed.data.regimen_category ?? null,
    p_treatment_phase: parsed.data.treatment_phase ?? null,
    p_outcome: parsed.data.outcome,
    p_outcome_date: parsed.data.outcome_date ?? null,
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/hiv-tb')
  revalidatePath(`/dashboard/hiv-tb/tb/${id}`)
  revalidatePath(`/dashboard/patients/${parsed.data.patient_id}`)
  return { success: true, id }
}

export async function recordTpt(
  input: RecordTptInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const staff = await requireStaff()
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = RecordTptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }

  const id = randomUUID()
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_tpt', {
    p_id: id,
    p_patient_id: parsed.data.patient_id,
    p_indication: parsed.data.indication,
    p_started_at: parsed.data.started_at ?? null,
    p_completed_at: parsed.data.completed_at ?? null,
    p_regimen: parsed.data.regimen ?? null,
    p_completed: parsed.data.completed,
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/hiv-tb')
  revalidatePath(`/dashboard/patients/${parsed.data.patient_id}`)
  return { success: true, id }
}

export async function loadHivCareDetail(enrollmentId: string) {
  const supabase = createServiceClient()
  const { data: enrollment, error } = await supabase
    .from('hiv_care_enrollments')
    .select(
      `*, patient:patients(id, first_name, last_name, display_name, patient_number, sex)`,
    )
    .eq('id', enrollmentId)
    .maybeSingle()
  if (error || !enrollment) return null

  const { data: vlTests } = await supabase
    .from('viral_load_tests')
    .select('id, test_date, result_copies, suppressed, notes')
    .eq('enrollment_id', enrollmentId)
    .order('test_date', { ascending: false })
    .limit(20)

  return { enrollment, vlTests: vlTests ?? [] }
}

export async function loadTbEpisodeDetail(episodeId: string) {
  const supabase = createServiceClient()
  const { data: episode, error } = await supabase
    .from('tb_episodes')
    .select(
      `*, patient:patients(id, first_name, last_name, display_name, patient_number, sex)`,
    )
    .eq('id', episodeId)
    .maybeSingle()
  if (error || !episode) return null
  return episode
}

async function fetchHmis106aQuality(
  clinicId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Hmis106aQualityStats> {
  const supabase = createServiceClient()

  const [hts, hivActive, tbActive, missingSex] = await Promise.all([
    supabase
      .from('hts_events')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('event_date', periodStart)
      .lt('event_date', periodEnd),
    supabase
      .from('hiv_care_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('care_status', ['pre_art', 'on_art']),
    supabase
      .from('tb_episodes')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('outcome', 'ongoing'),
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('sex', null),
  ])

  return {
    hts_events_in_period: hts.count ?? 0,
    hiv_enrollments_active: hivActive.count ?? 0,
    tb_episodes_active: tbActive.count ?? 0,
    missing_sex_patients: missingSex.count ?? 0,
  }
}

function map106aRows(rows: unknown[]): Hmis106aRow[] {
  return (rows as Hmis106aRow[]).map((r) => ({
    ...r,
    male_under_2: Number(r.male_under_2),
    female_under_2: Number(r.female_under_2),
    male_2_4: Number(r.male_2_4),
    female_2_4: Number(r.female_2_4),
    male_5_14: Number(r.male_5_14),
    female_5_14: Number(r.female_5_14),
    male_15_49: Number(r.male_15_49),
    female_15_49: Number(r.female_15_49),
    male_50_plus: Number(r.male_50_plus),
    female_50_plus: Number(r.female_50_plus),
    total: Number(r.total),
  }))
}

export async function generateHmis106aHivReport(
  fyStartYear: number,
  quarter: number,
  clinicId?: string,
): Promise<{ data?: Hmis106aReport; error?: string }> {
  const staff = await requireStaff()
  if (staff.role !== 'admin' && staff.role !== 'records_officer' && staff.role !== 'doctor') {
    return { error: 'Admin or records access required' }
  }

  const targetClinicId = clinicId ?? staff.clinic_id
  if (targetClinicId !== staff.clinic_id && staff.role !== 'admin') {
    return { error: 'Cannot report on another clinic' }
  }

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', targetClinicId)
    .single()
  if (!clinic) return { error: 'Clinic not found' }

  const { data: rows, error } = await supabase.rpc('generate_hmis_106a_hiv', {
    p_clinic_id: targetClinicId,
    p_fy_start_year: fyStartYear,
    p_quarter: quarter,
  })
  if (error) {
    console.error('generate_hmis_106a_hiv:', error)
    return { error: 'Failed to generate HIV quarterly report' }
  }

  const bounds = ugandaQuarterBounds(fyStartYear, quarter)
  const quality = await fetchHmis106aQuality(targetClinicId, bounds.start, bounds.end)

  return {
    data: {
      clinic_id: targetClinicId,
      clinic_name: clinic.name,
      report: 'hiv',
      fy_start_year: fyStartYear,
      quarter,
      quarter_label: bounds.label,
      period_start: bounds.start,
      period_end: bounds.end,
      generated_at: new Date().toISOString(),
      rows: map106aRows(rows ?? []),
      quality,
    },
  }
}

export async function generateHmis106aTbReport(
  fyStartYear: number,
  quarter: number,
  clinicId?: string,
): Promise<{ data?: Hmis106aReport; error?: string }> {
  const staff = await requireStaff()
  if (staff.role !== 'admin' && staff.role !== 'records_officer' && staff.role !== 'doctor') {
    return { error: 'Admin or records access required' }
  }

  const targetClinicId = clinicId ?? staff.clinic_id
  if (targetClinicId !== staff.clinic_id && staff.role !== 'admin') {
    return { error: 'Cannot report on another clinic' }
  }

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', targetClinicId)
    .single()
  if (!clinic) return { error: 'Clinic not found' }

  const { data: rows, error } = await supabase.rpc('generate_hmis_106a_tb', {
    p_clinic_id: targetClinicId,
    p_fy_start_year: fyStartYear,
    p_quarter: quarter,
  })
  if (error) {
    console.error('generate_hmis_106a_tb:', error)
    return { error: 'Failed to generate TB quarterly report' }
  }

  const bounds = ugandaQuarterBounds(fyStartYear, quarter)
  const quality = await fetchHmis106aQuality(targetClinicId, bounds.start, bounds.end)

  return {
    data: {
      clinic_id: targetClinicId,
      clinic_name: clinic.name,
      report: 'tb',
      fy_start_year: fyStartYear,
      quarter,
      quarter_label: bounds.label,
      period_start: bounds.start,
      period_end: bounds.end,
      generated_at: new Date().toISOString(),
      rows: map106aRows(rows ?? []),
      quality,
    },
  }
}
