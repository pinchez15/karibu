export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue' | 'void'

export interface InvoiceLine { kind: string; description: string; quantity: number; unit_amount: number; amount: number }

export interface Invoice {
  id: string
  number: string
  clinic_account_id: string
  clinic_name: string
  period_start: string | null
  issue_date: string
  due_date: string
  lines: InvoiceLine[]
  amount: number
  amount_paid: number
  currency: string
  status: InvoiceStatus
  sent_at: string | null
  void_reason: string | null
  efris_reference: string | null
  public_token: string
}

export interface Money {
  invoices: Invoice[]
  unconfirmed_payments: {
    id: string; amount: number; currency: string; method: 'momo_mtn' | 'airtel' | 'cash' | 'bank'; reference: string | null
    payer_phone: string | null; payer_name: string | null; paid_at: string
    suggested_invoice_id: string | null; suggested_invoice: { number: string; clinic_name: string } | null
  }[]
  open_invoices: { id: string; number: string; balance: number; clinic_name: string }[]
  totals: { billed: number; collected: number; outstanding: number }
  by_month: { month: string; billed: number; collected: number; outstanding: number }[]
  by_clinic: { clinic_account_id: string; clinic_name: string; billed: number; collected: number; outstanding: number }[]
  billable: { id: string; name: string; tier: 'core' | 'full' | 'pro' | null; stage: string }[]
}

export const STATUS_CHIP: Record<InvoiceStatus, string> = {
  draft: 'chip-neutral', sent: 'chip-info', part_paid: 'chip-warning', paid: 'chip-success', overdue: 'chip-danger', void: 'chip-neutral',
}
