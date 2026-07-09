import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { loadAdmissionChart } from '../../actions'
import { PrintBlocker } from './PrintBlocker'
import { DischargeSummaryPrint } from '@/components/inpatient/print/DischargeSummaryPrint'
import { AdmissionChartPrint } from '@/components/inpatient/print/AdmissionChartPrint'
import type { PrintFacility } from '@/components/inpatient/print/print-format'

export const dynamic = 'force-dynamic'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

/**
 * B3/B4 — inpatient print route.
 *   /dashboard/inpatient/[id]/print          -> discharge summary (B3)
 *   /dashboard/inpatient/[id]/print?full=1   -> full admission chart (B4)
 * Follows the dashboard/visits/[id]/print pattern: server component fetches
 * data + branches to a PrintBlocker for a recoverable "not ready" state,
 * otherwise renders the (client) print view.
 */
export default async function InpatientPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ full?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const { id } = await params
  const { full } = await searchParams
  const isFullChart = full === '1'

  const chart = await loadAdmissionChart(id, staff.clinic_id)
  if (!chart) notFound()

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, phone, umdpc_number, district, subcounty')
    .eq('id', staff.clinic_id)
    .maybeSingle()

  const facility: PrintFacility = {
    name: clinic?.name ?? 'Karibu Health',
    phone: (clinic?.phone as string | null) ?? null,
    umdpc_number: (clinic?.umdpc_number as string | null) ?? null,
    district: (clinic?.district as string | null) ?? null,
    subcounty: (clinic?.subcounty as string | null) ?? null,
  }

  if (isFullChart) {
    return (
      <AdmissionChartPrint
        facility={facility}
        admission={chart.admission}
        observations={chart.observations}
        medicationOrders={chart.medicationOrders}
        medicationAdmins={chart.medicationAdmins}
        notes={chart.notes}
        ivInfusions={chart.ivInfusions}
        ivInfusionChecks={chart.ivInfusionChecks}
        delivery={chart.delivery}
        postnatalObs={chart.postnatalObs}
      />
    )
  }

  if (chart.admission.status === 'active') {
    return (
      <PrintBlocker
        title="Not discharged yet"
        message="This patient is still admitted, so there's no discharge summary to print. Discharge the patient from the chart first, or print the full chart instead."
        ctaHref={`/dashboard/inpatient/${id}`}
        ctaLabel="Open admission chart"
      />
    )
  }

  // Medications "on discharge" = active treatment orders at close-out. The
  // discharge RPC (055) doesn't auto-stop orders, so "active" here reflects
  // whatever was still active when this page is viewed — the closest
  // available proxy for "active at close-out" given the current schema.
  const activeMedications = chart.medicationOrders.filter((o) => o.active)

  return (
    <DischargeSummaryPrint
      facility={facility}
      admission={chart.admission}
      activeMedications={activeMedications}
    />
  )
}
