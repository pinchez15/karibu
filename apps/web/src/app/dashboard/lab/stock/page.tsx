import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { LabStockClient, type LabStockRow } from './LabStockClient'

async function getStock(clinicId: string): Promise<LabStockRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lab_stock_items')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('test_name', { ascending: true })

  if (error) {
    console.error('Failed to load lab stock:', error)
    return []
  }
  return (data ?? []) as LabStockRow[]
}

export default async function LabStockPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const stock = await getStock(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Stock"
        subtitle="LAB · INVENTORY"
      />
      <div className="p-6 overflow-auto flex-1">
        <LabStockClient initialRows={stock} />
      </div>
    </>
  )
}
