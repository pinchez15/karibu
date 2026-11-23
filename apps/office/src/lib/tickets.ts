export interface Ticket {
  id: string
  office_id: string | null
  clinic_account_id: string | null
  clinic_name: string | null
  office_name: string | null
  raised_by: { name: string; role: string } | null
  category: 'how_to' | 'bug' | 'sync' | 'printing' | 'access' | 'billing' | 'other' | null
  body: string
  context: Record<string, string>
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  escalated_to_karibu: boolean
  escalation_note: string | null
  resolution: string | null
  created_at: string
  notes?: { author_kind: 'clinic' | 'office' | 'karibu'; author_name: string | null; body: string; at: string }[]
}

export const TICKET_CHIP = { open: 'chip-danger', in_progress: 'chip-warning', resolved: 'chip-success', closed: 'chip-neutral' } as const
