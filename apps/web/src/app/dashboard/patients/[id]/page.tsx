import Link from 'next/link'
import { Send } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicPrescribingCatalog } from '@/lib/clinic-catalog'
import { measureServerLoader, PERF_LOADER } from '@/lib/server-timing'
import { WebTopBar } from '@/components/web-shell'
import { patientDisplayName } from '@/lib/referral-summary'
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
  return measureServerLoader(PERF_LOADER.patientPage, async () => {
    const staff = await getStaff()
    if (!staff) redirect('/')

    const { id: patientId } = await params

    // Parallel fetch — these are independent reads. The prescribing catalog
    // feeds the chart's "New script" sheet and is unstable_cache'd (5 min).
    const [patient, latestVitals, initialTimeline, prescribingCatalog] =
      await Promise.all([
        getPatient(patientId),
        getPatientLatestVitals(patientId),
        getPatientTimeline(patientId, undefined, 20),
        getClinicPrescribingCatalog(staff.clinic_id),
      ])

    if (!patient) {
      redirect('/dashboard/visits')
    }

    const supabase = createServiceClient()

    // Retired patients (migration 111) still render — old links must not
    // 404 — with a banner pointing at the surviving record when one was set.
    let retiredMergedInto: { id: string; name: string } | null = null
    if (patient.retired_at && patient.merged_into_patient_id) {
      const { data: survivor } = await supabase
        .from('patients')
        .select('id, first_name, last_name, display_name')
        .eq('id', patient.merged_into_patient_id)
        .eq('clinic_id', staff.clinic_id)
        .maybeSingle()
      if (survivor) {
        retiredMergedInto = {
          id: survivor.id as string,
          name: patientDisplayName(survivor),
        }
      }
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayVisit } = await supabase
      .from('visits')
      .select('id, status, pharmacy_order_submitted_at')
      .eq('clinic_id', staff.clinic_id)
      .eq('patient_id', patientId)
      .gte('visit_date', todayStart.toISOString().slice(0, 10))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Today's still-open visit, if any — the chart actions reuse it instead
    // of creating a duplicate. The server action re-checks; this only feeds
    // the toolbar's "Open today's visit" affordance.
    const activeVisit =
      todayVisit && todayVisit.status !== 'completed'
        ? {
            id: todayVisit.id as string,
            status: todayVisit.status as string,
            pharmacy_order_submitted_at:
              (todayVisit.pharmacy_order_submitted_at as string | null) ?? null,
          }
        : null

    const name = patientDisplayName(patient)
    const patientNumber = patient.patient_number ?? `#${patientId.slice(0, 8)}`

    return (
      <>
        <WebTopBar
          title={name}
          subtitle={patientNumber}
          subtitleMeta={false}
          actions={
            <>
              {todayVisit?.id && (
                <Link
                  href={`/dashboard/referrals/new?visitId=${todayVisit.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-background"
                >
                  <Send className="h-4 w-4" />
                  Refer
                </Link>
              )}
              <Link
                href="/dashboard/visits"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                All patients
              </Link>
            </>
          }
        />
        <div className="flex-1 overflow-auto px-8 py-6 max-w-4xl">
          <PatientDetailClient
            staffRole={staff.role}
            patient={patient}
            latestVitals={latestVitals}
            initialTimeline={initialTimeline}
            activeVisit={activeVisit}
            prescribingCatalog={prescribingCatalog}
            retiredMergedInto={retiredMergedInto}
          />
        </div>
      </>
    )
  })
}
