import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { PharmacyStockClient, type PharmacyStockRow } from './PharmacyStockClient'
import { RealtimeRefresher } from '@/components/realtime-refresher'

export type ExpiringBatchRow = {
  stock_item_id: string
  drug_name: string
  strength: string | null
  formulation: string
  batch_id: string
  batch_number: string | null
  expires_at: string
  quantity_on_hand: number
  gtin: string | null
}

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

async function getExpiringBatches(clinicId: string, days = 60): Promise<ExpiringBatchRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_pharmacy_batches_expiring', {
    p_clinic_id: clinicId,
    p_days: days,
  })
  if (error) {
    console.error('rpc_pharmacy_batches_expiring failed:', error)
    return []
  }
  return (data ?? []) as ExpiringBatchRow[]
}

export default async function PharmacyStockPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  // Dispenser + admin + clinical officer (dual-acts as pharmacist) — see migration 093.
  if (
    staff.role !== 'dispenser' &&
    staff.role !== 'admin' &&
    staff.role !== 'clinical_officer'
  ) {
    redirect('/dashboard')
  }

  const [stock, pharmacyMarkupPercent, expiringBatches] = await Promise.all([
    getStock(staff.clinic_id),
    getPharmacyMarkupPercent(staff.clinic_id),
    getExpiringBatches(staff.clinic_id, 60),
  ])

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
          expiringBatches={expiringBatches}
        />
      </div>
    </>
  )
}
