import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getStaff } from '@/lib/auth'
import {
  getPatient,
  getPatientLatestVitals,
  getPatientTimeline,
} from './actions'
import { PatientDetailClient } from './PatientDetailClient'

/**
 * Phase 3 patient detail page.
 *
 * Loads the patient row, the latest-known vitals (per-field, see
 * rpc_get_patient_latest_vitals), and the first page of the chronological
 * timeline (visits + notes + vitals + payments) in parallel. The interactive
 * piece — pagination, add-note modal, autosave + sign — lives in
 * PatientDetailClient.
 */
export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { id: patientId } = await params

  // Parallel fetch — these are independent reads.
  const [patient, latestVitals, initialTimeline] = await Promise.all([
    getPatient(patientId),
    getPatientLatestVitals(patientId),
    getPatientTimeline(patientId, undefined, 50),
  ])

  if (!patient) {
    redirect('/dashboard/visits')
  }

  return (
    <div className="p-4 space-y-4">
      <Link href="/dashboard/visits">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Patients
        </Button>
      </Link>

      <PatientDetailClient
        staffRole={staff.role}
        patient={patient}
        latestVitals={latestVitals}
        initialTimeline={initialTimeline}
      />
    </div>
  )
}
