import type { FeeStatus, StageInfo } from '@/lib/types'

export interface OfficeRow {
  id: string
  slug: string
  name: string
  country: string
  currency: string
  territory: string
  status: 'pending' | 'active' | 'suspended' | 'closed'
  certified_at: string | null
  fee_status: FeeStatus
  fee_amount: number
  fee_starts_on: string | null
  fee_months_due: number
  stage: StageInfo
  owner: { name: string; joined: boolean } | null
  clinics: number
  health: { green: number; amber: number; red: number }
}

export interface Overview {
  offices: OfficeRow[]
  conflicts: {
    id: string
    created_at: string
    proposed: { name?: string; district?: string }
    claiming_office: string | null
    holding_office: string | null
    held_stage: string | null
  }[]
  fund: { fund: string; currency: string; collected: number }[]
  escalated_tickets: number
}
