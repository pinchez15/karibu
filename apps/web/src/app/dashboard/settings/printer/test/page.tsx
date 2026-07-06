import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { getClinicPrintSettings } from '@/lib/clinic-print-settings'
import { getClinicLetterheadForTest } from '../actions'
import { ThermalTestReceipt, LongThermalTestReceipt } from './ThermalTestReceipt'

export const dynamic = 'force-dynamic'

export default async function ThermalPrinterTestPage({
  searchParams,
}: {
  searchParams: Promise<{ long?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const [printSettings, letterhead, params] = await Promise.all([
    getClinicPrintSettings(staff.clinic_id),
    getClinicLetterheadForTest(),
    searchParams,
  ])

  const clinicName = letterhead?.name ?? 'Karibu Health'
  const clinicPhone = letterhead?.phone ?? null

  if (params.long === '1') {
    return (
      <LongThermalTestReceipt
        clinicName={clinicName}
        clinicPhone={clinicPhone}
        printSettings={printSettings}
      />
    )
  }

  return (
    <ThermalTestReceipt
      clinicName={clinicName}
      clinicPhone={clinicPhone}
      printSettings={printSettings}
    />
  )
}
