import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getStaff, isAdmin } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { getClinicPrintSettingsForAdmin } from './actions'
import { PrinterSetupClient } from './PrinterSetupClient'

export default async function AdminPrinterPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  const settings = await getClinicPrintSettingsForAdmin()
  if (!settings) redirect('/dashboard')

  return (
    <>
      <WebTopBar
        title="Thermal printer"
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
      <div className="flex-1 overflow-auto px-8 py-6">
        <PrinterSetupClient initial={settings} />
      </div>
    </>
  )
}
