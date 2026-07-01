'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type {
  AdmissionDetail,
  AdmissionNote,
  AdmissionObservation,
  CensusRow,
  DeliveryDetail,
  InpatientVisitContext,
  IvInfusion,
  IvInfusionCheck,
  MedicationAdmin,
  MedicationOrder,
  ObservationInput,
  PostnatalObservationRow,
} from './types'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

type ActionResult = { success: true } | { success: false; error: string }

function clinicalRoleError(role: string): string | null {
  if (!CLINICAL_ROLES.has(role)) {
    return 'Forbidden: clinical role required'
  }
  return null
}

async function assertAdmissionInClinic(admissionId: string, clinicId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('admissions')
    .select('id, clinic_id, patient_id, status')
    .eq('id', admissionId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  return data
}

export async function loadActiveAdmissions(clinicId: string): Promise<CensusRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_active_admissions', {
    p_clinic_id: clinicId,
  })
  if (error) {
    console.error('rpc_active_admissions failed:', error)
    return []
  }
  return (data ?? []) as CensusRow[]
}

export async function loadAdmissionChart(admissionId: string, clinicId: string) {
  const supabase = createServiceClient()

  const { data: admission, error: admErr } = await supabase
    .from('admissions')
    .select(
      `
      id, patient_id, clinic_id, ward, bed_label, chief_complaint,
      admission_type, weight_kg, provisional_dx, gravida, para, edd,
      gestation_weeks, hiv_status, presenting_status, admitted_at, status,
      patient:patients(id, first_name, last_name, display_name, date_of_birth, sex, patient_number)
    `,
    )
    .eq('id', admissionId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (admErr || !admission) return null

  const patient = Array.isArray(admission.patient) ? admission.patient[0] : admission.patient
  if (!patient) return null

  const obsPromise = supabase.rpc('rpc_admission_observations', { p_admission_id: admissionId })
  const ordersPromise = supabase.rpc('rpc_admission_medication_orders', { p_admission_id: admissionId })
  const adminsPromise = supabase.rpc('rpc_admission_medication_admins', { p_admission_id: admissionId })
  const notesPromise = supabase.rpc('rpc_admission_notes', { p_admission_id: admissionId })
  const ivPromise = supabase.rpc('rpc_admission_iv_infusions', { p_admission_id: admissionId })
  const ivChecksPromise = supabase.rpc('rpc_admission_iv_infusion_checks', { p_admission_id: admissionId })

  const [
    { data: observations },
    { data: orders },
    { data: admins },
    { data: notes },
    ivResult,
    ivChecksResult,
    visitCtx,
  ] = await Promise.all([
    obsPromise,
    ordersPromise,
    adminsPromise,
    notesPromise,
    ivPromise,
    ivChecksPromise,
    ensureInpatientVisit(admissionId, clinicId, admission.patient_id as string),
  ])

  const ivInfusions = ivResult.error ? [] : ((ivResult.data ?? []) as IvInfusion[])
  const ivInfusionChecks = ivChecksResult.error ? [] : ((ivChecksResult.data ?? []) as IvInfusionCheck[])
  if (ivResult.error) console.warn('rpc_admission_iv_infusions:', ivResult.error.message)
  if (ivChecksResult.error) console.warn('rpc_admission_iv_infusion_checks:', ivChecksResult.error.message)

  const ward = admission.ward as string
  let delivery: DeliveryDetail | null = null
  let postnatalObs: PostnatalObservationRow[] = []
  if (ward === 'maternity') {
    const [{ data: deliveryRows }, { data: postnatalRows }] = await Promise.all([
      supabase.rpc('rpc_admission_delivery', { p_admission_id: admissionId }),
      supabase.rpc('rpc_admission_postnatal_obs', { p_admission_id: admissionId }),
    ])
    delivery = ((deliveryRows ?? [])[0] ?? null) as DeliveryDetail | null
    postnatalObs = (postnatalRows ?? []) as PostnatalObservationRow[]
  }

  return {
    admission: {
      ...admission,
      patient,
    } as AdmissionDetail,
    observations: (observations ?? []) as AdmissionObservation[],
    medicationOrders: (orders ?? []) as MedicationOrder[],
    medicationAdmins: (admins ?? []) as MedicationAdmin[],
    notes: (notes ?? []) as AdmissionNote[],
    ivInfusions,
    ivInfusionChecks,
    visit: visitCtx,
    delivery,
    postnatalObs,
  }
}

/** Find or create a visit linked to this admission for lab/pharmacy orders. */
export async function ensureInpatientVisit(
  admissionId: string,
  clinicId: string,
  patientId: string,
): Promise<InpatientVisitContext | null> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('visits')
    .select('id, tests_ordered, lab_status, medications, pharmacy_order_submitted_at')
    .eq('admission_id', admissionId)
    .eq('clinic_id', clinicId)
    .order('visit_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      visitId: existing.id as string,
      tests_ordered: existing.tests_ordered as string | null,
      lab_status: existing.lab_status as string | null,
      medications: existing.medications as string | null,
      pharmacy_order_submitted_at: existing.pharmacy_order_submitted_at as string | null,
    }
  }

  const visitId = randomUUID()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('visits').insert({
    id: visitId,
    clinic_id: clinicId,
    patient_id: patientId,
    admission_id: admissionId,
    visit_date: today,
    department: 'opd',
    status: 'pending',
    queue_status: 'waiting',
    priority: 'normal',
  })

  if (error) {
    console.error('Failed to create inpatient visit:', error)
    return null
  }

  return {
    visitId,
    tests_ordered: null,
    lab_status: 'not_ordered',
    medications: null,
    pharmacy_order_submitted_at: null,
  }
}

export async function admitPatient(input: {
  patientId: string
  ward: 'general' | 'maternity'
  bedLabel?: string
  weightKg?: number
  chiefComplaint?: string
  gravida?: number
  para?: number
  gestationWeeks?: number
  presentingStatus?: string
  hivStatus?: string
}): Promise<{ success: true; admissionId: string } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', input.patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }

  const { data: admissionId, error } = await supabase.rpc('rpc_admit_patient_v2', {
    p_patient_id: input.patientId,
    p_ward: input.ward,
    p_bed_label: input.bedLabel?.trim() || null,
    p_chief_complaint: input.chiefComplaint?.trim() || null,
    p_admission_type: input.ward,
    p_weight_kg: input.weightKg ?? null,
    p_provisional_dx: null,
    p_gravida: input.gravida ?? null,
    p_para: input.para ?? null,
    p_edd: null,
    p_gestation_weeks: input.gestationWeeks ?? null,
    p_hiv_status: input.hivStatus?.trim() || null,
    p_presenting_status: input.presentingStatus?.trim() || null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/inpatient')
  return { success: true, admissionId: admissionId as string }
}

export async function recordAdmissionObservation(
  admissionId: string,
  input: ObservationInput,
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }
  if (admission.status !== 'active') return { success: false, error: 'Admission is closed' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_admission_observation', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_observed_at: new Date().toISOString(),
    p_temp_c: input.tempC ?? null,
    p_pulse_bpm: input.pulseBpm ?? null,
    p_resp_rate: input.respRate ?? null,
    p_bp_systolic: input.bpSystolic ?? null,
    p_bp_diastolic: input.bpDiastolic ?? null,
    p_spo2_pct: input.spo2Pct ?? null,
    p_avpu: input.avpu ?? null,
    p_imci_not_feeding: input.imciNotFeeding ?? false,
    p_imci_vomiting_everything: input.imciVomitingEverything ?? false,
    p_imci_convulsions: input.imciConvulsions ?? false,
    p_imci_lethargic_unconscious: input.imciLethargicUnconscious ?? false,
    p_note: input.note?.trim() || null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  revalidatePath('/dashboard/inpatient')
  return { success: true }
}

export async function addMedicationOrder(
  admissionId: string,
  input: {
    drugName: string
    dose?: string
    route?: string
    frequency?: string
    instructions?: string
  },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const drug = input.drugName.trim()
  if (!drug) return { success: false, error: 'Drug name is required' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_add_medication_order', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_drug_name: drug,
    p_dose: input.dose?.trim() || null,
    p_route: input.route?.trim() || null,
    p_frequency: input.frequency?.trim() || null,
    p_instructions: input.instructions?.trim() || null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function recordMedicationAdmin(
  admissionId: string,
  orderId: string,
  given: boolean,
  notGivenReason?: string,
  scheduledFor?: string,
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_medication_admin', {
    p_id: randomUUID(),
    p_order_id: orderId,
    p_status: given ? 'given' : 'not_given',
    p_not_given_reason: given ? null : notGivenReason?.trim() || 'Other',
    p_administered_at: new Date().toISOString(),
    p_scheduled_for: scheduledFor ?? null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function stopMedicationOrder(admissionId: string, orderId: string): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_stop_medication_order', {
    p_order_id: orderId,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function addAdmissionNote(admissionId: string, text: string): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const note = text.trim()
  if (!note) return { success: false, error: 'Note is required' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_admission_note', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_note: note,
    p_created_at: new Date().toISOString(),
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function dischargeAdmission(
  admissionId: string,
  input: { outcome: string; disposition?: string; notes?: string },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_discharge_admission', {
    p_admission_id: admissionId,
    p_outcome: input.outcome,
    p_disposition: input.disposition ?? 'home',
    p_notes: input.notes?.trim() || null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/inpatient')
  return { success: true }
}

export async function referAdmission(
  admissionId: string,
  input: {
    toFacility: string
    urgency: 'routine' | 'urgent' | 'emergency'
    reason: string
    transportMode?: string
  },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const visit = await ensureInpatientVisit(admissionId, staff.clinic_id, admission.patient_id)
  if (!visit) return { success: false, error: 'Could not create visit for referral' }

  const supabase = createServiceClient()
  const { error: refErr } = await supabase.rpc('rpc_create_referral', {
    p_id: randomUUID(),
    p_clinic_id: staff.clinic_id,
    p_patient_id: admission.patient_id,
    p_visit_id: visit.visitId,
    p_from_department: 'inpatient',
    p_to_facility: input.toFacility.trim(),
    p_urgency: input.urgency,
    p_reason: input.reason.trim(),
    p_clinical_summary: null,
    p_transport_mode: input.transportMode?.trim() || null,
    p_client_op_id: null,
  })
  if (refErr) return { success: false, error: refErr.message }

  const { error: discErr } = await supabase.rpc('rpc_discharge_admission', {
    p_admission_id: admissionId,
    p_outcome: 'referred',
    p_disposition: 'referred',
    p_notes: `Referred to ${input.toFacility.trim()}`,
    p_client_op_id: null,
  })
  if (discErr) return { success: false, error: discErr.message }

  revalidatePath('/dashboard/inpatient')
  return { success: true }
}

export async function startIvInfusion(
  admissionId: string,
  input: {
    fluidType: string
    volumeMl: number
    additive?: string
    rateMlHr?: number
    dropsPerMin?: number
    siteLocation?: string
    notes?: string
  },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_start_iv_infusion', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_fluid_type: input.fluidType,
    p_volume_ml: input.volumeMl,
    p_additive: input.additive && input.additive !== 'none' ? input.additive : null,
    p_rate_ml_hr: input.rateMlHr ?? null,
    p_drops_per_min: input.dropsPerMin ?? null,
    p_site_location: input.siteLocation?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function recordIvInfusionCheck(
  admissionId: string,
  infusionId: string,
  input: { dripRunning: boolean; siteOk: boolean; note?: string },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_iv_infusion_check', {
    p_id: randomUUID(),
    p_infusion_id: infusionId,
    p_drip_running: input.dripRunning,
    p_site_ok: input.siteOk,
    p_note: input.note?.trim() || null,
    p_checked_at: new Date().toISOString(),
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function stopIvInfusion(admissionId: string, infusionId: string): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_stop_iv_infusion', {
    p_infusion_id: infusionId,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function recordDelivery(
  admissionId: string,
  input: {
    mode?: string | null
    outcome?: string | null
    babySex?: string | null
    birthWeightG?: number | null
    apgar1?: number | null
    apgar5?: number | null
    bloodLossMl?: number | null
    oxytocinGiven?: boolean
    placentaComplete?: boolean | null
    resuscitationDone?: boolean
    vitaminKGiven?: boolean
    earlyBreastfeeding?: boolean
    notes?: string | null
  },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_delivery', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_mode: input.mode ?? null,
    p_outcome: input.outcome ?? null,
    p_baby_sex: input.babySex ?? null,
    p_birth_weight_g: input.birthWeightG ?? null,
    p_apgar_1: input.apgar1 ?? null,
    p_apgar_5: input.apgar5 ?? null,
    p_blood_loss_ml: input.bloodLossMl ?? null,
    p_oxytocin_given: input.oxytocinGiven ?? false,
    p_placenta_complete: input.placentaComplete ?? null,
    p_resuscitation_done: input.resuscitationDone ?? false,
    p_vitamin_k_given: input.vitaminKGiven ?? false,
    p_early_breastfeeding: input.earlyBreastfeeding ?? false,
    p_notes: input.notes?.trim() || null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}

export async function recordPostnatalObservation(
  admissionId: string,
  input: {
    subject: 'mother' | 'newborn'
    tempC?: number | null
    pulseBpm?: number | null
    respRate?: number | null
    bpSystolic?: number | null
    bpDiastolic?: number | null
    bleeding?: string | null
    fundusFirm?: boolean | null
    feedingWell?: boolean | null
    notFeeding?: boolean
    convulsions?: boolean
    jaundice?: boolean
    note?: string | null
  },
): Promise<ActionResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const roleErr = clinicalRoleError(staff.role)
  if (roleErr) return { success: false, error: roleErr }

  const admission = await assertAdmissionInClinic(admissionId, staff.clinic_id)
  if (!admission) return { success: false, error: 'Admission not found' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_postnatal_obs', {
    p_id: randomUUID(),
    p_admission_id: admissionId,
    p_subject: input.subject,
    p_temp_c: input.tempC ?? null,
    p_pulse_bpm: input.pulseBpm ?? null,
    p_resp_rate: input.respRate ?? null,
    p_bp_systolic: input.bpSystolic ?? null,
    p_bp_diastolic: input.bpDiastolic ?? null,
    p_bleeding: input.bleeding ?? null,
    p_fundus_firm: input.fundusFirm ?? null,
    p_feeding_well: input.feedingWell ?? null,
    p_not_feeding: input.notFeeding ?? false,
    p_convulsions: input.convulsions ?? false,
    p_jaundice: input.jaundice ?? false,
    p_note: input.note?.trim() || null,
    p_client_op_id: null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/inpatient/${admissionId}`)
  return { success: true }
}
