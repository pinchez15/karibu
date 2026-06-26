import { redirect } from 'next/navigation'
import { getStaff, isAdmin } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { BulkStockImportClient } from './BulkStockImportClient'

type PageProps = {
  searchParams: Promise<{ tab?: string }>
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
        />
      </div>
    </>
  )
}
