export type OfficeRole = 'owner' | 'sales' | 'implementer' | 'support'

export type ClinicStage =
  | 'lead' | 'contacted' | 'demo' | 'readiness' | 'configured' | 'trained'
  | 'kit_delivered' | 'live' | 'steady' | 'billed' | 'churned'

export const PIPELINE_STAGES: ClinicStage[] = [
  'lead', 'contacted', 'demo', 'readiness', 'configured', 'trained',
  'kit_delivered', 'live', 'steady', 'billed',
]

/** Stages a person may set. live, steady and billed come from clinic activity. */
export const MANUAL_STAGES: ClinicStage[] = [
  'lead', 'contacted', 'demo', 'readiness', 'configured', 'trained', 'kit_delivered',
]

export type HealthScore = 'green' | 'amber' | 'red'

export interface Membership {
  member_id: string | null
  office_id: string
  slug: string
  name: string
  role: OfficeRole | 'central'
  status: string
}

export interface Me {
  is_central: boolean
  memberships: Membership[]
  all_offices: { office_id: string; slug: string; name: string; status: string }[]
}

export interface Office {
  id: string
  slug: string
  name: string
  country: 'UG'
  currency: string
  territory: string
  legal_name: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  payout_details: { momo_mtn?: string; airtel?: string; bank?: string; account_name?: string }
  public_profile: { name?: string; firstName?: string; title?: string; photo?: string; bio?: string }
  status: 'pending' | 'active' | 'suspended' | 'closed'
  certified_at: string | null
  fee_amount: number
  fee_starts_on: string | null
  invoice_prefix: string
  created_at: string
}

export interface StageInfo {
  stage: 1 | 2 | 3 | 4 | 5
  derived_stage: number
  overridden: boolean
  readiness_cleared: number
  live_clinics: number
  invoices_issued: number
  staff: number
}

export type FeeStatus = 'not_started' | 'current' | 'due' | 'lapsed'

export interface Task {
  id: string
  kind: string
  title: string
  detail: Record<string, unknown>
  due_at: string | null
  source: 'manual' | 'alert' | 'ai' | 'system'
  created_at?: string
  clinic_account_id: string | null
  clinic_name?: string | null
}

export interface Home {
  office: Office
  member_id: string | null
  role: OfficeRole | null
  stage: StageInfo
  fee_status: FeeStatus
  counts: { pipeline: number; onboarding: number; live: number }
  invoices: { overdue: number; outstanding: number }
  unmatched_payments: number
  open_tickets: number
  tasks: Task[]
}

export interface ClinicAccount {
  id: string
  office_id: string
  clinic_id: string | null
  name: string
  district: string | null
  facility_level: string | null
  contact_name: string | null
  contact_phone: string | null
  champion_name: string | null
  champion_phone: string | null
  stage: ClinicStage
  tier: 'core' | 'full' | 'pro' | null
  source: string
  assigned_member_id: string | null
  assigned_member: string | null
  go_live_mode: 'site_visit' | 'remote' | null
  next_action: string | null
  next_action_at: string | null
  last_contact_at: string | null
  notes: string | null
  staff_count: number | null
  readiness_cleared_at: string | null
  billing_starts_on: string | null
  created_at: string
  health: { score: HealthScore; reasons: string[]; day: string } | null
}
