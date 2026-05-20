import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { PharmacyStockClient, type PharmacyStockRow } from './PharmacyStockClient'

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

export default async function PharmacyStockPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const stock = await getStock(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Stock"
        subtitle="PHARMACY · INVENTORY"
      />
      <div className="p-6 overflow-auto flex-1">
        <PharmacyStockClient initialRows={stock} />
      </div>
    </>
  )
}
