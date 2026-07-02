'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'

export type BillingPatientHit = { id: string; name: string; number: number | null }

export type PatientBalanceRow = {
  patient_id: string
  patient_name: string
  charged: number
  paid: number
  balance: number
  last_charge_at: string | null
}

export type PatientChargeRow = {
  id: string
  description: string
  category: string | null
  amount_ugx: number
  quantity: number
  unit_price_ugx: number | null
  visit_id: string | null
  source: string
  created_at: string
  voided: boolean
  created_by_name: string | null
}

export type PatientPaymentRow = {
  id: string
  amount_ugx: number
  amount_barter_ugx: number
  barter_description: string | null
  payment_method: string
  receipt_number: string | null
  created_at: string
  collected_by_name: string | null
}

export type PatientVisitOption = {
  id: string
  label: string
  started_at: string | null
}

function staffDisplayName(
  row: { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null,
): string | null {
  if (!row) return null
  const composed = [row.first_name, row.last_name].filter(Boolean).join(' ')
  return (row.display_name?.trim() || composed || null) as string | null
}

function billingPaths(patientId?: string) {
  revalidatePath('/dashboard/billing')
  if (patientId) {
    revalidatePath(`/dashboard/billing/${patientId}`)
    revalidatePath(`/dashboard/billing/${patientId}/receipt`)
  }
}

/** Search patients for the billing charge picker (clinic-scoped). */
export async function searchBillingPatients(query: string): Promise<BillingPatientHit[]> {
  let staff
  try {
    staff = await requireStaff()
  } catch {
    return []
  }
  const term = query.trim().replace(/[,()%_\\]/g, ' ')
  if (term.length < 2) return []
  const supabase = createServiceClient()
  const pattern = `%${term}%`
  const { data } = await supabase
    .from('patients')
    .select('id, display_name, first_name, last_name, patient_id, whatsapp_number')
    .eq('clinic_id', staff.clinic_id)
    .or(
      [
        `display_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `whatsapp_number.ilike.${pattern}`,
      ].join(','),
    )
    .limit(8)
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name:
      (p.display_name as string | null) ||
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      'Unknown patient',
    number: (p.patient_id as number | null) ?? null,
  }))
}

export async function listPatientBalances(): Promise<PatientBalanceRow[]> {
  let staff
  try {
    staff = await requireStaff()
  } catch {
    return []
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_billing_patient_balances', {
    p_clinic_id: staff.clinic_id,
  })
  if (error) {
    console.error('billing: patient balances', error)
    return []
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    patient_id: r.patient_id as string,
    patient_name: r.patient_name as string,
    charged: Number(r.charged ?? 0),
    paid: Number(r.paid ?? 0),
    balance: Number(r.balance ?? 0),
    last_charge_at: (r.last_charge_at as string | null) ?? null,
  }))
}

export async function getPatientBillingDetail(patientId: string): Promise<{
  balance: { charged: number; paid: number; balance: number }
  charges: PatientChargeRow[]
  payments: PatientPaymentRow[]
  visits: PatientVisitOption[]
} | null> {
  let staff
  try {
    staff = await requireStaff()
  } catch {
    return null
  }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return null

  const [{ data: bal }, { data: charges }, { data: payments }, { data: visits }] = await Promise.all([
    supabase.rpc('rpc_patient_balance', { p_clinic_id: staff.clinic_id, p_patient_id: patientId }),
    supabase
      .from('charges')
      .select(
        'id, description, category, amount_ugx, quantity, unit_price_ugx, visit_id, source, created_at, voided, creator:staff!created_by(display_name, first_name, last_name)',
      )
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select(
        'id, amount_ugx, amount_barter_ugx, barter_description, payment_method, receipt_number, created_at, collector:staff!collected_by(display_name, first_name, last_name)',
      )
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false }),
    supabase
      .from('visits')
      .select('id, visit_date, department, tests_ordered, created_at')
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const balRow = (Array.isArray(bal) ? bal[0] : bal) as
    | { charged: number; paid: number; balance: number }
    | undefined

  return {
    balance: {
      charged: Number(balRow?.charged ?? 0),
      paid: Number(balRow?.paid ?? 0),
      balance: Number(balRow?.balance ?? 0),
    },
    charges: (charges ?? []).map((c) => ({
      id: c.id as string,
      description: c.description as string,
      category: c.category as string | null,
      amount_ugx: Number(c.amount_ugx),
      quantity: Number(c.quantity ?? 1),
      unit_price_ugx: c.unit_price_ugx != null ? Number(c.unit_price_ugx) : null,
      visit_id: c.visit_id as string | null,
      source: c.source as string,
      created_at: c.created_at as string,
      voided: Boolean(c.voided),
      created_by_name: staffDisplayName(
        c.creator as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null,
      ),
    })),
    payments: (payments ?? []).map((p) => ({
      id: p.id as string,
      amount_ugx: Number(p.amount_ugx),
      amount_barter_ugx: Number(p.amount_barter_ugx ?? 0),
      barter_description: p.barter_description as string | null,
      payment_method: p.payment_method as string,
      receipt_number: p.receipt_number as string | null,
      created_at: p.created_at as string,
      collected_by_name: staffDisplayName(
        p.collector as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null,
      ),
    })),
    visits: (visits ?? []).map((v) => {
      const date = v.visit_date
        ? new Date(v.visit_date as string).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : v.created_at
          ? new Date(v.created_at as string).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Unknown date'
      const dept = (v.department as string | null) ?? 'OPD'
      const tests = (v.tests_ordered as string | null)?.trim()
      return {
        id: v.id as string,
        label: `${date} · ${dept.toUpperCase()}${tests ? ` · ${tests.slice(0, 40)}` : ''}`,
        started_at: (v.visit_date as string | null) ?? (v.created_at as string | null),
      }
    }),
  }
}

/**
 * Raise a charge (bill line) for a patient. Backed by rpc_add_charge (migration 071).
 */
export async function addCharge(input: {
  patientId: string
  category: string
  description: string
  amountUgx: number
  visitId?: string | null
  quantity?: number
  unitPriceUgx?: number
}): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  if (!input.patientId) return { success: false, error: 'Pick a patient.' }
  if (!input.description.trim()) return { success: false, error: 'Description is required.' }
  if (!Number.isFinite(input.amountUgx) || input.amountUgx < 0) {
    return { success: false, error: 'Enter a valid amount.' }
  }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', input.patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found in your clinic' }

  const { data: chargeId, error } = await supabase.rpc('rpc_add_charge', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: input.patientId,
    p_description: input.description.trim(),
    p_amount_ugx: Math.round(input.amountUgx),
    p_visit_id: input.visitId ?? null,
    p_category: input.category,
    p_source: 'manual',
  })
  if (error) return { success: false, error: error.message }

  const qty = input.quantity ?? 1
  const unit = input.unitPriceUgx ?? Math.round(input.amountUgx / qty)
  if (chargeId) {
    await supabase
      .from('charges')
      .update({ quantity: qty, unit_price_ugx: unit })
      .eq('id', chargeId)
      .eq('clinic_id', staff.clinic_id)
  }

  billingPaths(input.patientId)
  return { success: true }
}

/** Compose charges from consultation, completed labs, and dispensed pharmacy on a visit. */
export async function generateChargesFromVisit(
  patientId: string,
  visitId: string,
): Promise<{ success: true; added: number } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('id, patient_id')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .eq('patient_id', patientId)
    .maybeSingle()
  if (!visit) return { success: false, error: 'Visit not found' }

  const { data: added, error } = await supabase.rpc('rpc_generate_charges_from_visit', {
    p_visit_id: visitId,
  })
  if (error) return { success: false, error: error.message }

  billingPaths(patientId)
  return { success: true, added: Number(added ?? 0) }
}

export async function voidCharge(
  patientId: string,
  chargeId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = createServiceClient()
  const { data: charge } = await supabase
    .from('charges')
    .select('id')
    .eq('id', chargeId)
    .eq('patient_id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!charge) return { success: false, error: 'Charge not found' }

  const { error } = await supabase.rpc('rpc_void_charge', { p_charge_id: chargeId })
  if (error) return { success: false, error: error.message }

  billingPaths(patientId)
  return { success: true }
}

/** Adjust an existing charge line (e.g. waive consultation or correct MRDT price). */
export async function updateChargeAmount(
  patientId: string,
  chargeId: string,
  amountUgx: number,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const amount = Math.round(amountUgx)
  if (amount < 0) return { success: false, error: 'Amount must be non-negative' }

  const supabase = createServiceClient()
  const { data: charge } = await supabase
    .from('charges')
    .select('id, quantity, voided')
    .eq('id', chargeId)
    .eq('patient_id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (!charge || charge.voided) return { success: false, error: 'Charge not found' }

  const qty = Math.max(1, Number(charge.quantity ?? 1))
  const unit = Math.round(amount / qty)

  const { error } = await supabase
    .from('charges')
    .update({ amount_ugx: amount, unit_price_ugx: unit })
    .eq('id', chargeId)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }

  billingPaths(patientId)
  return { success: true }
}

export async function recordBillingPayment(input: {
  patientId: string
  amountCashUgx: number
  amountBarterUgx: number
  paymentMethod: string
  barterDescription?: string
  visitId?: string | null
  notes?: string
}): Promise<{ success: true; receiptNumber: string | null } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const cash = Math.round(input.amountCashUgx)
  const barter = Math.round(input.amountBarterUgx)
  if (cash < 0 || barter < 0) return { success: false, error: 'Amounts must be non-negative' }
  if (cash + barter <= 0) return { success: false, error: 'Enter a payment amount' }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_record_billing_payment', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: input.patientId,
    p_amount_cash_ugx: cash,
    p_payment_method: input.paymentMethod,
    p_visit_id: input.visitId ?? null,
    p_amount_barter_ugx: barter,
    p_barter_description: input.barterDescription?.trim() || null,
    p_notes: input.notes?.trim() || null,
  })
  if (error) return { success: false, error: error.message }

  billingPaths(input.patientId)
  const row = data as { receipt_number?: string } | null
  return { success: true, receiptNumber: row?.receipt_number ?? null }
}
