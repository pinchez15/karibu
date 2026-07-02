import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { getClinicPrintSettingsForStaff } from './actions'
import { PrinterSetupClient } from './PrinterSetupClient'

export default async function PrinterSettingsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const settings = await getClinicPrintSettingsForStaff()
  if (!settings) redirect('/dashboard')

  return (
    <>
      <WebTopBar
        title="Thermal printer"
        subtitle="SETTINGS"
        actions={
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <PrinterSetupClient initial={settings} />
      </div>
    </>
  )
}
