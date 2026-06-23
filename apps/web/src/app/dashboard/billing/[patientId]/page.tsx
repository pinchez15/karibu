import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { getPatientBillingDetail } from '../actions'
import { PatientBillClient } from './PatientBillClient'

export default async function PatientBillPage({
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
    .select('display_name, first_name, last_name')
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .single()
  if (!patient) notFound()

  const detail = await getPatientBillingDetail(patientId)
  if (!detail) notFound()

  const patientName =
    (patient.display_name as string | null) ||
    [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
    'Patient'

  return (
    <>
      <WebTopBar title="Billing" subtitle="PATIENT BILL" />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1 max-w-4xl">
        <PatientBillClient
          patientId={patientId}
          patientName={patientName}
          charges={detail.charges}
          payments={detail.payments}
          visits={detail.visits}
        />
      </div>
    </>
  )
}
