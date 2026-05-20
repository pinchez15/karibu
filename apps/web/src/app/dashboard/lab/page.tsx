import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { LabQueueClient, type LabRow } from './LabQueueClient'

/**
 * Lab board — MVP.
 *
 * Queue source: visits where the clinician has recorded `tests_ordered`
 * (free text — written into the visit during dictation or via the AI
 * structuring pipeline) and lab_status is 'pending' or 'running'.
 *
 * Result entry is also free text on `visits.lab_results`. Once we've
 * watched lab techs use this in real clinics, a follow-up migration adds
 * structured `lab_orders` + `lab_results` rows per test.
 */

async function getLabQueue(clinicId: string): Promise<LabRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      chief_complaint,
      diagnosis,
      tests_ordered,
      lab_status,
      lab_results,
      lab_abnormal,
      doctor_id,
      doctor:staff!visits_doctor_id_fkey (display_name),
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name,
        date_of_birth,
        sex
      )
    `)
    .eq('clinic_id', clinicId)
    .not('tests_ordered', 'is', null)
    .neq('tests_ordered', '')
    .in('lab_status', ['pending', 'running'])
    .order('visit_date', { ascending: true })
    .limit(100)

  if (error) {
    console.error('Failed to load lab queue:', error)
    return []
  }
  return (data ?? []) as unknown as LabRow[]
}

export default async function LabPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const queue = await getLabQueue(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Today"
        subtitle="LABORATORY · ORDERS"
        actions={
          <Link
            href="/dashboard/lab/history"
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
                <FlaskConical className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">No lab orders pending</h2>
              <p className="text-base text-body leading-relaxed">
                Visits with tests ordered by the clinician land here. Run the test, enter the result,
                and flag it abnormal if the ordering clinician needs to act on it immediately.
              </p>
            </div>
          </div>
        ) : (
          <LabQueueClient initialRows={queue} />
        )}
      </div>
    </>
  )
}
