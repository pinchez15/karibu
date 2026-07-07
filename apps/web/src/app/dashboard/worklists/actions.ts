'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import { broadcastClinicRefresh } from '@/lib/realtime-server'
import type {
  CareTaskStatus,
  CareTaskType,
  StaffRole,
  VisitPriority,
} from '@karibu/shared'

// Phase 5 worklists — thin server actions around the rpc_worklist_* RPCs
// defined in packages/supabase/migrations/041_care_tasks_and_worklists.sql.
//
// Auth pattern:
//   - getStaff() resolves the Clerk user to a staff row + clinic_id.
//   - Every RPC is called with the staff's clinic_id explicitly.
//   - The service-role client bypasses RLS; the RPCs themselves re-verify
//     that the (Clerk JWT) caller is staff at the requested clinic. With the
//     service-role JWT there's no `sub` claim, so the RPC trusts our
//     server-side check.
//
// Return types mirror the RETURNS TABLE columns one-for-one. Don't add fields
// here without also updating the SQL.

export interface NeedsVitalsRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  chief_complaint: string | null
  queue_status: string
  checked_in_at: string | null
}

export interface NeedsClinicianRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  chief_complaint: string | null
  queue_status: string
  priority: VisitPriority
  doctor_id: string | null
  checked_in_at: string | null
  wait_minutes: number | null
}

export interface NeedsLabRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  chief_complaint: string | null
  lab_status: string
  doctor_id: string | null
  visit_date: string
}

export interface NeedsPharmacyRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  medications: string | null
  dispensing_status: string
  doctor_id: string | null
  visit_date: string
}

export interface PharmacyReturnedRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  medications: string | null
  dispense_notes: string | null
  doctor_id: string | null
  visit_date: string
}

export interface ResultsReadyRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  chief_complaint: string | null
  lab_status: string
  lab_results: string | null
  lab_abnormal: boolean
  doctor_id: string | null
  visit_date: string
}

export interface NeedsPaymentRow {
  visit_id: string
  patient_id: string
  patient_name: string
  sex: 'M' | 'F' | null
  derived_age: number | null
  diagnosis: string | null
  visit_date: string
  documentation_completed_at: string | null
}

export interface MyDraftRow {
  note_id: string
  patient_id: string
  patient_name: string
  visit_id: string | null
  source: string
  transcript_preview: string
  updated_at: string
}

export interface CareTaskRow {
  task_id: string
  patient_id: string
  patient_name: string
  visit_id: string | null
  task_type: CareTaskType
  title: string
  description: string | null
  assignee_role: StaffRole | null
  assignee_id: string | null
  due_at: string | null
  status: CareTaskStatus
  created_at: string
}

export interface CareTaskFilters {
  assignee_role?: StaffRole | null
  assignee_id?: string | null
  task_type?: CareTaskType | null
}

export interface AllWorklistsResult {
  needsVitals: NeedsVitalsRow[]
  needsClinician: NeedsClinicianRow[]
  needsLab: NeedsLabRow[]
  needsPharmacy: NeedsPharmacyRow[]
  pharmacyReturned: PharmacyReturnedRow[]
  resultsReady: ResultsReadyRow[]
  needsPayment: NeedsPaymentRow[]
  myDrafts: MyDraftRow[]
  careTasks: CareTaskRow[]
}

/** Fetch all worklists with a single auth lookup + parallel RPCs. */
export async function getAllWorklists(
  department: string = 'opd',
): Promise<AllWorklistsResult> {
  const staff = await getStaff()
  if (!staff) {
    return {
      needsVitals: [],
      needsClinician: [],
      needsLab: [],
      needsPharmacy: [],
      pharmacyReturned: [],
      resultsReady: [],
      needsPayment: [],
      myDrafts: [],
      careTasks: [],
    }
  }

  const supabase = createServiceClient()
  const clinicId = staff.clinic_id
  const staffId = staff.id

  const [
    needsVitalsRes,
    needsClinicianRes,
    needsLabRes,
    needsPharmacyRes,
    pharmacyReturnedRes,
    resultsReadyRes,
    needsPaymentRes,
    myDraftsRes,
    careTasksRes,
  ] = await Promise.all([
    supabase.rpc('rpc_worklist_needs_vitals', { p_clinic_id: clinicId, p_department: department }),
    supabase.rpc('rpc_worklist_needs_clinician', { p_clinic_id: clinicId, p_department: department }),
    supabase.rpc('rpc_worklist_needs_lab', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_worklist_needs_pharmacy', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_worklist_pharmacy_returned', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_worklist_results_ready', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_worklist_needs_payment', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_worklist_my_drafts', { p_clinic_id: clinicId, p_staff_id: staffId }),
    supabase.rpc('rpc_worklist_care_tasks', {
      p_clinic_id: clinicId,
      p_assignee_role: null,
      p_assignee_id: null,
      p_task_type: null,
    }),
  ])

  const log = (name: string, error: { message: string } | null) => {
    if (error) console.error(`${name} failed:`, error)
  }
  log('rpc_worklist_needs_vitals', needsVitalsRes.error)
  log('rpc_worklist_needs_clinician', needsClinicianRes.error)
  log('rpc_worklist_needs_lab', needsLabRes.error)
  log('rpc_worklist_needs_pharmacy', needsPharmacyRes.error)
  log('rpc_worklist_pharmacy_returned', pharmacyReturnedRes.error)
  log('rpc_worklist_results_ready', resultsReadyRes.error)
  log('rpc_worklist_needs_payment', needsPaymentRes.error)
  log('rpc_worklist_my_drafts', myDraftsRes.error)
  log('rpc_worklist_care_tasks', careTasksRes.error)

  return {
    needsVitals: (needsVitalsRes.data ?? []) as NeedsVitalsRow[],
    needsClinician: (needsClinicianRes.data ?? []) as NeedsClinicianRow[],
    needsLab: (needsLabRes.data ?? []) as NeedsLabRow[],
    needsPharmacy: (needsPharmacyRes.data ?? []) as NeedsPharmacyRow[],
    pharmacyReturned: (pharmacyReturnedRes.data ?? []) as PharmacyReturnedRow[],
    resultsReady: (resultsReadyRes.data ?? []) as ResultsReadyRow[],
    needsPayment: (needsPaymentRes.data ?? []) as NeedsPaymentRow[],
    myDrafts: (myDraftsRes.data ?? []) as MyDraftRow[],
    careTasks: (careTasksRes.data ?? []) as CareTaskRow[],
  }
}

// ---------------------------------------------------------------------------
// Worklist fetchers (legacy — prefer getAllWorklists on index pages)
// ---------------------------------------------------------------------------

export async function getNeedsVitals(
  department: string = 'opd',
): Promise<NeedsVitalsRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_needs_vitals', {
    p_clinic_id: staff.clinic_id,
    p_department: department,
  })
  if (error) {
    console.error('rpc_worklist_needs_vitals failed:', error)
    return []
  }
  return (data ?? []) as NeedsVitalsRow[]
}

export async function getNeedsClinician(
  department: string = 'opd',
): Promise<NeedsClinicianRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_needs_clinician', {
    p_clinic_id: staff.clinic_id,
    p_department: department,
  })
  if (error) {
    console.error('rpc_worklist_needs_clinician failed:', error)
    return []
  }
  return (data ?? []) as NeedsClinicianRow[]
}

export async function getNeedsLab(): Promise<NeedsLabRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_needs_lab', {
    p_clinic_id: staff.clinic_id,
  })
  if (error) {
    console.error('rpc_worklist_needs_lab failed:', error)
    return []
  }
  return (data ?? []) as NeedsLabRow[]
}

export async function getNeedsPharmacy(): Promise<NeedsPharmacyRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_needs_pharmacy', {
    p_clinic_id: staff.clinic_id,
  })
  if (error) {
    console.error('rpc_worklist_needs_pharmacy failed:', error)
    return []
  }
  return (data ?? []) as NeedsPharmacyRow[]
}

export async function getNeedsPayment(): Promise<NeedsPaymentRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_needs_payment', {
    p_clinic_id: staff.clinic_id,
  })
  if (error) {
    console.error('rpc_worklist_needs_payment failed:', error)
    return []
  }
  return (data ?? []) as NeedsPaymentRow[]
}

/**
 * Drafts authored by the calling staff member. Service-role caller, so we
 * pass p_staff_id explicitly — the RPC requires it when there's no Clerk JWT.
 * Migration 042 added the created_by filter; before that this returned every
 * clinic draft.
 */
export async function getMyDrafts(): Promise<MyDraftRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_my_drafts', {
    p_clinic_id: staff.clinic_id,
    p_staff_id: staff.id,
  })
  if (error) {
    console.error('rpc_worklist_my_drafts failed:', error)
    return []
  }
  return (data ?? []) as MyDraftRow[]
}

export async function getCareTasks(
  filters: CareTaskFilters = {},
): Promise<CareTaskRow[]> {
  const staff = await getStaff()
  if (!staff) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_worklist_care_tasks', {
    p_clinic_id: staff.clinic_id,
    p_assignee_role: filters.assignee_role ?? null,
    p_assignee_id: filters.assignee_id ?? null,
    p_task_type: filters.task_type ?? null,
  })
  if (error) {
    console.error('rpc_worklist_care_tasks failed:', error)
    return []
  }
  return (data ?? []) as CareTaskRow[]
}

export interface CreateCareTaskInput {
  patientId: string
  visitId?: string | null
  taskType: CareTaskType
  title: string
  description?: string | null
  assigneeRole?: StaffRole | null
  dueAt?: string | null
}

export async function createCareTask(
  input: CreateCareTaskInput,
): Promise<{ success: true; taskId: string } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Unauthorized' }

  const title = input.title.trim()
  if (!title) return { success: false, error: 'Title is required' }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_create_care_task', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: input.patientId,
    p_task_type: input.taskType,
    p_title: title,
    p_description: input.description?.trim() || null,
    p_visit_id: input.visitId ?? null,
    p_assignee_role: input.assigneeRole ?? null,
    p_assignee_id: null,
    p_due_at: input.dueAt ?? null,
    p_client_op_id: crypto.randomUUID(),
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/worklists')
  revalidatePath(`/dashboard/patients/${input.patientId}`)
  if (input.visitId) revalidatePath(`/dashboard/visits/${input.visitId}`)
  void broadcastClinicRefresh(staff.clinic_id)
  return { success: true, taskId: data as string }
}

export async function completeCareTask(
  taskId: string,
  patientId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_complete_care_task', {
    p_task_id: taskId,
    p_client_op_id: crypto.randomUUID(),
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/worklists')
  if (patientId) revalidatePath(`/dashboard/patients/${patientId}`)
  void broadcastClinicRefresh(staff.clinic_id)
  return { success: true }
}
