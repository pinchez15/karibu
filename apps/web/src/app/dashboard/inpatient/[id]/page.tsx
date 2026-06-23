import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { AdmissionChartClient } from '@/components/inpatient/AdmissionChartClient'
import { loadAdmissionChart } from '../actions'
import type { StaffRole } from '@karibu/shared'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function AdmissionChartPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const { id } = await params
  const chart = await loadAdmissionChart(id, staff.clinic_id)
  if (!chart) notFound()

  if (chart.admission.status !== 'active') {
    redirect('/dashboard/inpatient')
  }

  return (
    <AdmissionChartClient
      admission={chart.admission}
      observations={chart.observations}
      medicationOrders={chart.medicationOrders}
      medicationAdmins={chart.medicationAdmins}
      notes={chart.notes}
      ivInfusions={chart.ivInfusions}
      ivInfusionChecks={chart.ivInfusionChecks}
      visit={chart.visit}
      staffRole={staff.role as StaffRole}
    />
  )
}
