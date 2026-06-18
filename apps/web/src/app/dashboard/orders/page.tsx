import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import {
  OrdersClient,
  type LabOrderRow,
  type PharmacyOrderRow,
  type ReferralRow,
} from './OrdersClient'
import { RealtimeRefresher } from '@/components/realtime-refresher'

// Orders is a clinic-wide operational view: it must show every open lab and
// pharmacy request at the clinic, not just those assigned to the logged-in
// clinician. The previous `.eq('doctor_id', staffId)` filter hid orders placed
// by other clinicians and orders on not-yet-claimed visits (doctor_id null).
async function getLabOrders(clinicId: string): Promise<LabOrderRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`
      id, visit_date, tests_ordered, lab_status, lab_results, lab_abnormal,
      patient:patients!inner (id, patient_number, first_name, last_name, display_name)
    `)
    .eq('clinic_id', clinicId)
    .not('tests_ordered', 'is', null)
    .neq('tests_ordered', '')
    .order('visit_date', { ascending: false })
    .limit(50)

  if (error) {
    console.error('orders: labs', error)
    return []
  }
  return (data ?? []) as unknown as LabOrderRow[]
}

async function getPharmacyOrders(clinicId: string): Promise<PharmacyOrderRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`
      id, visit_date, medications, dispensing_status,
      patient:patients!inner (id, patient_number, first_name, last_name, display_name)
    `)
    .eq('clinic_id', clinicId)
    .not('medications', 'is', null)
    .neq('medications', '')
    .order('visit_date', { ascending: false })
    .limit(50)

  if (error) {
    console.error('orders: pharmacy', error)
    return []
  }
  return (data ?? []) as unknown as PharmacyOrderRow[]
}

async function getReferralsToday(clinicId: string): Promise<ReferralRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_list_referrals_today', {
    p_clinic_id: clinicId,
  })

  if (error) {
    console.error('orders: referrals', error)
    return []
  }
  return (data ?? []) as ReferralRow[]
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { tab } = await searchParams
  const initialTab =
    tab === 'labs' || tab === 'pharmacy' || tab === 'referrals' ? tab : 'all'

  const [labs, pharmacy, referrals] = await Promise.all([
    getLabOrders(staff.clinic_id),
    getPharmacyOrders(staff.clinic_id),
    getReferralsToday(staff.clinic_id),
  ])

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <>
      <WebTopBar title="Orders" subtitle={today} subtitleMeta={false} />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="flex-1 overflow-auto px-8 py-6 max-w-3xl">
        <OrdersClient
          labs={labs}
          pharmacy={pharmacy}
          referrals={referrals}
          initialTab={initialTab}
        />
      </div>
    </>
  )
}
