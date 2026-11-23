import type { ClinicAccount } from '@/lib/types'

export type CheckKey = 'power' | 'devices' | 'signal' | 'catalog' | 'champion' | 'training'
export type DraftKind = 'drugs' | 'services' | 'staff'

export interface Draft {
  id: string
  rows: Record<string, string>[]
  source: 'ai' | 'manual' | 'form'
  status: 'draft' | 'approved' | 'applied'
  apply_result: { created?: number; updated?: number; skipped?: number; consultation_fee?: number | null; not_applied?: number } | null
}

export interface Onboarding {
  account: ClinicAccount
  can_provision: boolean
  readiness: null | {
    check_id: string
    token: string
    expires_at: string
    expired: boolean
    status: 'sent' | 'submitted' | 'reviewed'
    submitted_at: string | null
    power: { source?: string; backup?: boolean } | null
    devices: { android_phones?: number; tablets?: number; computers?: number; printer?: boolean } | null
    signal: { network?: string; bars?: number; down_kbps?: number } | null
    staff: { name: string; role: string; phone: string; email: string }[] | null
    services: string[] | null
    departments: string[] | null
    champion: { name?: string; phone?: string } | null
    photos: { kind: 'price_list' | 'drug_list' | 'staff_roster' | 'signal'; path: string }[]
  }
  drafts: Partial<Record<DraftKind, Draft>>
  training: {
    staff: { staff_id: string; name: string; role: string; modules_done: number; modules_total: number; trained: boolean }[]
    invited: { invitation_id: string; name: string; email: string; role: string; invited_at: string }[]
    total: number
    trained: number
    pct: number
  }
  score: { score: 'green' | 'amber' | 'red'; submitted: boolean; checks: { key: CheckKey; status: 'pass' | 'warn' | 'fail' }[] }
  clinic: { slug: string; departments: string[] } | null
}

export const EHR_ROLES = [
  'nurse', 'clinical_officer', 'midwife', 'nursing_assistant', 'records_officer', 'lab_tech', 'dispenser', 'doctor', 'admin',
] as const

/** Best guess at an EHR role from what the clinic typed. The partner confirms each one. */
export function guessRole(typed: string): (typeof EHR_ROLES)[number] {
  const s = typed.toLowerCase()
  if (/in.?charge|admin|manager|director/.test(s)) return 'admin'
  if (/clinical officer|\bco\b/.test(s)) return 'clinical_officer'
  if (/midwi/.test(s)) return 'midwife'
  if (/assistant|aide/.test(s)) return 'nursing_assistant'
  if (/record|recept|clerk|cashier|account/.test(s)) return 'records_officer'
  if (/lab/.test(s)) return 'lab_tech'
  if (/dispens|pharm/.test(s)) return 'dispenser'
  if (/doctor|\bdr\b|medical officer/.test(s)) return 'doctor'
  return 'nurse'
}
