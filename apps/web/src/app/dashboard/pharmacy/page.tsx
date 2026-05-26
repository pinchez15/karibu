import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { PharmacyQueueClient, type DispensingRow } from './PharmacyQueueClient'

/**
 * Pharmacy dispensing board — MVP.
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

export default async function PharmacyPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const queue = await getPharmacyQueue(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Today"
        subtitle="PHARMACY · DISPENSING"
        actions={
          <Link
            href="/dashboard/pharmacy/history"
            className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px]"
          >
            History
          </Link>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        {queue.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="max-w-lg text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cobalt-soft text-cobalt mb-5">
                <Pill className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">No prescriptions to dispense</h2>
              <p className="text-base text-body leading-relaxed">
                Visits appear here after the clinician taps Send to pharmacy (note may still be open).
                Check back as patients move through the clinic.
              </p>
            </div>
          </div>
        ) : (
          <PharmacyQueueClient initialRows={queue} />
        )}
      </div>
    </>
  )
}
