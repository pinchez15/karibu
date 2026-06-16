import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WorkspaceTopBar } from '@/components/workspace-top-bar'
import { PharmacyStationClient } from './PharmacyStationClient'
import { type DispensingRow, formatOldestWait } from './pharmacy-shared'

/**
 * Pharmacy dispensing board — station workspace (MasterDetail).
 *
 * Queue source: visits where the clinician submitted a pharmacy order
 * (`pharmacy_order_submitted_at`) with non-empty `medications` and dispensing
 * is not yet terminal. Independent of `documentation_complete`.
 */

const STATUS_FILTER = ['not_started', 'in_progress', 'partial', 'out_of_stock']

async function getPharmacyQueue(clinicId: string): Promise<DispensingRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      diagnosis,
      chief_complaint,
      medications,
      dispensing_status,
      dispense_notes,
      pharmacy_order_submitted_at,
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name,
        date_of_birth,
        sex,
        whatsapp_number
      )
    `)
    .eq('clinic_id', clinicId)
    .not('pharmacy_order_submitted_at', 'is', null)
    .not('medications', 'is', null)
    .neq('medications', '')
    .in('dispensing_status', STATUS_FILTER)
    .order('pharmacy_order_submitted_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('Failed to load pharmacy queue:', error)
    return []
  }
  return (data ?? []) as unknown as DispensingRow[]
}

export default async function PharmacyPage({
  searchParams,
}: {
  searchParams: Promise<{ visit?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const queue = await getPharmacyQueue(staff.clinic_id)
  const oldestSubmitted = queue[0]?.pharmacy_order_submitted_at ?? null

  return (
    <>
      <WorkspaceTopBar
        title="Today"
        roleLabel="PHARMACY · DISPENSING"
        awaiting={queue.length}
        oldestWaitLabel={formatOldestWait(oldestSubmitted)}
        actions={
          <Link
            href="/dashboard/pharmacy/history"
            className="rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-body"
          >
            History
          </Link>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {queue.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="max-w-lg text-center">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-cobalt-soft text-cobalt">
                <Pill className="h-7 w-7" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold tracking-tight">
                No prescriptions to dispense
              </h2>
              <p className="text-base leading-relaxed text-body">
                Visits appear here after the clinician taps Send to pharmacy (note may still be
                open). Check back as patients move through the clinic.
              </p>
            </div>
          </div>
        ) : (
          <PharmacyStationClient
            initialRows={queue}
            initialVisitId={params.visit ?? null}
          />
        )}
      </div>
    </>
  )
}
