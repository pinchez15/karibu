import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { PharmacyStockClient, type PharmacyStockRow } from './PharmacyStockClient'
import { RealtimeRefresher } from '@/components/realtime-refresher'

async function getStock(clinicId: string): Promise<PharmacyStockRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pharmacy_stock_items')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('drug_name', { ascending: true })

  if (error) {
    console.error('Failed to load pharmacy stock:', error)
    return []
  }
  return (data ?? []) as PharmacyStockRow[]
}

async function getPharmacyMarkupPercent(clinicId: string): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinic_billing_rates')
    .select('pharmacy_markup_percent')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  return Number(data?.pharmacy_markup_percent ?? 10)
}

export default async function PharmacyStockPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const stock = await getStock(staff.clinic_id)
  const pharmacyMarkupPercent = await getPharmacyMarkupPercent(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Stock"
        subtitle="PHARMACY · INVENTORY"
      />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 overflow-auto flex-1">
        <PharmacyStockClient
          initialRows={stock}
          pharmacyMarkupPercent={pharmacyMarkupPercent}
        />
      </div>
    </>
  )
}
