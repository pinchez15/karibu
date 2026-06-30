import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { isAdmin, getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { getClinicBillingRates } from './actions'
import { BillingRatesClient } from './BillingRatesClient'

export default async function AdminBillingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  const rates = await getClinicBillingRates()
  if (!rates) redirect('/dashboard')

  return (
    <>
      <WebTopBar
        title="Billing rates"
        subtitle="ADMIN"
        actions={
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6 max-w-3xl">
        <BillingRatesClient initial={rates} />
      </div>
    </>
  )
}
