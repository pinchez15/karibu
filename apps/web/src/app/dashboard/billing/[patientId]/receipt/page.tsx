import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { BillingReceipt, type BillingReceiptData } from './BillingReceipt'

export default async function BillingReceiptPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  const staff = await getStaff()
  if (!staff) redirect('/')

  const supabase = createServiceClient()

  const { data: patient } = await supabase
    .from('patients')
    .select('display_name, first_name, last_name, patient_id')
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .single()
  if (!patient) notFound()

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, phone, umdpc_number')
    .eq('id', staff.clinic_id)
    .single()

  const [{ data: charges }, { data: payments }] = await Promise.all([
    supabase
      .from('charges')
      .select('description, amount_ugx, created_at')
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .eq('voided', false)
      .order('created_at', { ascending: true }),
    supabase
      .from('payments')
      .select('amount_ugx, amount_barter_ugx, barter_description, payment_method, status, receipt_number, created_at')
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .eq('status', 'paid')
      .order('created_at', { ascending: true }),
  ])

  const data: BillingReceiptData = {
    patient,
    clinic: clinic ?? null,
    charges: (charges ?? []).map((c) => ({
      description: c.description as string,
      amount_ugx: Number(c.amount_ugx),
    })),
    payments: (payments ?? []).map((p) => ({
      method: p.payment_method as string,
      amount_ugx: Number(p.amount_ugx),
      amount_barter_ugx: Number(p.amount_barter_ugx ?? 0),
      barter_description: (p.barter_description as string | null) ?? null,
      receipt_number: (p.receipt_number as string | null) ?? null,
    })),
  }

  return <BillingReceipt data={data} />
}
