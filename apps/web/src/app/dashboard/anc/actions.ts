'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { eddFromLmp, lmpFromGestationWeeks } from '@/lib/anc-protocol'
import { createServiceClient } from '@/lib/supabase'
import {
  RecordAncContactSchema,
  StartPregnancySchema,
  type RecordAncContactInput,
  type StartPregnancyInput,
} from '@/lib/validators/anc'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

function clinicalRoleError(role: string): string | null {
  if (!CLINICAL_ROLES.has(role)) return 'Forbidden: clinical role required'
  return null
}

export type ActivePregnancyRow = {
  id: string
  patient_id: string
  patient_name: string | null
  lmp: string | null
  edd: string | null
  gravida: number | null
  para: number | null
  blood_group: string | null
  hiv_status: string | null
  syphilis_status: string | null
  hepb_status: string | null
  risk_notes: string | null
  contact_count: number
  iptp_count: number
  td_count: number
  last_contact_at: string | null
}

export type AncContactRow = {
  id: string
  pregnancy_id: string
  clinic_id: string
  patient_id: string
  contact_number: number | null
  contact_date: string
  gestation_weeks: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  weight_kg: number | null
  fundal_height_cm: number | null
  fetal_heart_rate: number | null
  urine_protein: string | null
  hb: number | null
  iptp_given: boolean
  ifas_given: boolean
  td_given: boolean
  dewormed: boolean
  itn_given: boolean
  notes: string | null
  created_at: string
}

export type PregnancyDetail = ActivePregnancyRow & {
  patient: {
    id: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    patient_number: string | null
  } | null
}

export async function loadActivePregnancies(clinicId: string): Promise<ActivePregnancyRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_active_pregnancies', {
    p_clinic_id: clinicId,
  })
  if (error) {
    console.error('rpc_active_pregnancies failed:', error)
    return []
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    patient_id: String(row.patient_id),
    patient_name: (row.patient_name as string | null) ?? null,
    lmp: (row.lmp as string | null) ?? null,
    edd: (row.edd as string | null) ?? null,
    gravida: row.gravida != null ? Number(row.gravida) : null,
    para: row.para != null ? Number(row.para) : null,
    blood_group: (row.blood_group as string | null) ?? null,
    hiv_status: (row.hiv_status as string | null) ?? null,
    syphilis_status: (row.syphilis_status as string | null) ?? null,
    hepb_status: (row.hepb_status as string | null) ?? null,
    risk_notes: (row.risk_notes as string | null) ?? null,
    contact_count: Number(row.contact_count ?? 0),
    iptp_count: Number(row.iptp_count ?? 0),
    td_count: Number(row.td_count ?? 0),
    last_contact_at: (row.last_contact_at as string | null) ?? null,
  }))
}

export async function loadPregnancyDetail(
  pregnancyId: string,
  clinicId: string,
): Promise<PregnancyDetail | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pregnancies')
    .select(
      `
      id, patient_id, lmp, edd, gravida, para, blood_group,
      hiv_status, syphilis_status, hepb_status, risk_notes,
      patient:patients(id, first_name, last_name, display_name, patient_number)
    `,
    )
    .eq('id', pregnancyId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) {
    console.error('loadPregnancyDetail failed:', error)
    return null
  }

  const registry = await loadActivePregnancies(clinicId)
  const counts = registry.find((r) => r.id === pregnancyId)

  const patient = Array.isArray(data.patient) ? data.patient[0] : data.patient

  return {
    id: data.id,
    patient_id: data.patient_id,
    patient_name:
      patient?.display_name ||
      [patient?.first_name, patient?.last_name].filter(Boolean).join(' ') ||
      null,
    lmp: data.lmp,
    edd: data.edd,
    gravida: data.gravida,
    para: data.para,
    blood_group: data.blood_group,
    hiv_status: data.hiv_status,
    syphilis_status: data.syphilis_status,
    hepb_status: data.hepb_status,
    risk_notes: data.risk_notes,
    contact_count: counts?.contact_count ?? 0,
    iptp_count: counts?.iptp_count ?? 0,
    td_count: counts?.td_count ?? 0,
    last_contact_at: counts?.last_contact_at ?? null,
    patient: patient ?? null,
  }
}

export async function loadPregnancyContacts(pregnancyId: string): Promise<AncContactRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_pregnancy_contacts', {
    p_pregnancy_id: pregnancyId,
  })
  if (error) {
    console.error('rpc_pregnancy_contacts failed:', error)
    return []
  }
  return (data ?? []) as AncContactRow[]
}

export async function startPregnancy(
  input: StartPregnancyInput,
): Promise<{ success: true; pregnancyId: string } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = StartPregnancySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', parsed.data.patient_id)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }

  const pregnancyId = randomUUID()
  let lmp: string | null = null
  let edd: string | null = null
  if (parsed.data.gestation_weeks != null) {
    lmp = lmpFromGestationWeeks(parsed.data.gestation_weeks)
    edd = eddFromLmp(new Date(lmp)).toISOString().slice(0, 10)
  }

  const { error } = await supabase.rpc('rpc_start_pregnancy', {
    p_id: pregnancyId,
    p_patient_id: parsed.data.patient_id,
    p_lmp: lmp,
    p_edd: edd,
    p_gravida: parsed.data.gravida ?? null,
    p_para: parsed.data.para ?? null,
    p_blood_group: parsed.data.blood_group?.trim() || null,
    p_hiv_status: parsed.data.hiv_status ?? null,
    p_syphilis_status: null,
    p_hepb_status: null,
    p_risk_notes: parsed.data.risk_notes?.trim() || null,
    p_client_op_id: null,
  })

  if (error) {
    console.error('rpc_start_pregnancy failed:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/anc')
  return { success: true, pregnancyId }
}

export async function recordAncContact(
  input: RecordAncContactInput,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const parsed = RecordAncContactSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = createServiceClient()
  const { data: pregnancy } = await supabase
    .from('pregnancies')
    .select('id')
    .eq('id', parsed.data.pregnancy_id)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!pregnancy) return { success: false, error: 'Pregnancy not found' }

  const contactId = randomUUID()
  const { error } = await supabase.rpc('rpc_record_anc_contact', {
    p_id: contactId,
    p_pregnancy_id: parsed.data.pregnancy_id,
    p_contact_number: null,
    p_contact_date: new Date().toISOString(),
    p_gestation_weeks: null,
    p_bp_systolic: parsed.data.bp_systolic ?? null,
    p_bp_diastolic: parsed.data.bp_diastolic ?? null,
    p_weight_kg: parsed.data.weight_kg ?? null,
    p_fundal_height_cm: parsed.data.fundal_height_cm ?? null,
    p_fetal_heart_rate: parsed.data.fetal_heart_rate ?? null,
    p_urine_protein: parsed.data.urine_protein ?? null,
    p_hb: parsed.data.hb ?? null,
    p_iptp_given: parsed.data.iptp_given,
    p_ifas_given: parsed.data.ifas_given,
    p_td_given: parsed.data.td_given,
    p_dewormed: parsed.data.dewormed,
    p_itn_given: parsed.data.itn_given,
    p_notes: parsed.data.notes?.trim() || null,
    p_client_op_id: null,
  })

  if (error) {
    console.error('rpc_record_anc_contact failed:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/anc')
  revalidatePath(`/dashboard/anc/${parsed.data.pregnancy_id}`)
  return { success: true }
}
