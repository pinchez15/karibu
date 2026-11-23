export interface Milestone {
  id: string
  key: string
  amount: number
  status: 'pending' | 'verified' | 'released'
  verified_at: string | null
  evidence: Record<string, unknown> | null
  released_at: string | null
  release_reference: string | null
}

export interface Grant {
  id: string
  total: number
  currency: string
  starts_on: string
  notes: string | null
  released: number
  milestones: Milestone[]
}

/** Keys the platform can verify by itself today (office.verify_milestones). */
export const KNOWN_MILESTONES = ['first_clinic_live', 'first_clinic_steady_30d', 'three_clinics_billed'] as const

export const MILESTONE_CHIP = { pending: 'chip-neutral', verified: 'chip-warning', released: 'chip-success' } as const

export function evidenceText(evidence: Record<string, unknown> | null): string {
  if (!evidence) return ''
  const clinics = Array.isArray(evidence.clinics) ? (evidence.clinics as string[]).join(', ') : (evidence.clinic as string | undefined)
  const date = (evidence.steady_at ?? evidence.live_at) as string | undefined
  return [clinics, date ? new Date(date).toISOString().slice(0, 10) : null].filter(Boolean).join(' · ')
}
