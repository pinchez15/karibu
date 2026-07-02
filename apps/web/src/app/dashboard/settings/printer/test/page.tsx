import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { getClinicPrintSettings } from '@/lib/clinic-print-settings'
import { getClinicLetterheadForTest } from '../actions'
import { ThermalTestReceipt } from './ThermalTestReceipt'

export const dynamic = 'force-dynamic'

export default async function ThermalPrinterTestPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const [printSettings, letterhead] = await Promise.all([
    getClinicPrintSettings(staff.clinic_id),
    getClinicLetterheadForTest(),
  ])

  return (
    <ThermalTestReceipt
      clinicName={letterhead?.name ?? 'Karibu Health'}
      clinicPhone={letterhead?.phone ?? null}
      printSettings={printSettings}
    />
  )
}
