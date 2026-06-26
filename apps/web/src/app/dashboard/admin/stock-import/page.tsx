import { redirect } from 'next/navigation'
import { getStaff, isAdmin } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { BulkStockImportClient } from './BulkStockImportClient'
import { createServiceClient } from '@/lib/supabase'

type PageProps = {
  searchParams: Promise<{ tab?: string }>
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

export default async function StockImportPage({ searchParams }: PageProps) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  const canPharmacy = admin || staff.role === 'dispenser'
  const canLab = admin || staff.role === 'lab_tech'

  if (!canPharmacy && !canLab) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const tabParam = params.tab
  const initialTab =
    tabParam === 'lab' || tabParam === 'clinical' || tabParam === 'pharmacy'
      ? tabParam
      : canPharmacy
        ? 'pharmacy'
        : 'lab'

  const pharmacyMarkupPercent = await getPharmacyMarkupPercent(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Bulk stock import"
        subtitle="ADMIN · ONBOARDING"
      />
      <div className="p-6 overflow-auto flex-1 max-w-[1400px]">
        <BulkStockImportClient
          initialTab={initialTab}
          canPharmacy={canPharmacy}
          canLab={canLab}
          pharmacyMarkupPercent={pharmacyMarkupPercent}
        />
      </div>
    </>
  )
}
