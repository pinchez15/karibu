import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicPrintSettings } from '@/lib/clinic-print-settings'
import { PharmacyReceipt, type RxLine, type ReceiptHeader } from './PharmacyReceipt'

export const dynamic = 'force-dynamic'

export default async function PharmacyReceiptPage({
  params,
}: {
  params: Promise<{ visitId: string }>
}) {
  const { visitId } = await params
  const staff = await getStaff()
  if (!staff) redirect('/')

  const supabase = createServiceClient()

  const { data: visit } = await supabase
    .from('visits')
    .select(`
      id, visit_date,
      patient:patients(display_name, first_name, last_name, patient_id),
      clinic:clinics(name, phone, umdpc_number)
    `)
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .single()

  if (!visit) notFound()

  const { data: lines } = await supabase
    .from('prescription_orders')
    .select(`
      medication_code, free_text_name, dose_text, route_text, frequency_text,
      duration_text, quantity_prescribed, quantity_unit, sort_order,
      medication:medication_catalog(generic_name, strength, formulation)
    `)
    .eq('visit_id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .neq('status', 'cancelled')
    .order('sort_order', { ascending: true })

  const patient = (Array.isArray(visit.patient) ? visit.patient[0] : visit.patient) as ReceiptHeader['patient']
  const clinic = (Array.isArray(visit.clinic) ? visit.clinic[0] : visit.clinic) as ReceiptHeader['clinic']

  const header: ReceiptHeader = {
    visitId: visit.id,
    visitDate: visit.visit_date,
    patient,
    clinic,
  }

  const rxLines: RxLine[] = (lines ?? []).map((l) => {
    const med = (Array.isArray(l.medication) ? l.medication[0] : l.medication) as
      | { generic_name?: string; strength?: string | null; formulation?: string | null }
      | null
    return {
      name: med?.generic_name || l.free_text_name || l.medication_code || 'Medicine',
      strength: med?.strength ?? null,
      quantity: l.quantity_prescribed != null ? `${l.quantity_prescribed} ${l.quantity_unit ?? ''}`.trim() : null,
      dose_text: l.dose_text,
      route_text: l.route_text,
      frequency_text: l.frequency_text,
      duration_text: l.duration_text,
    }
  })

  const [printSettings] = await Promise.all([getClinicPrintSettings(staff.clinic_id)])

  return <PharmacyReceipt header={header} lines={rxLines} printSettings={printSettings} />
}
