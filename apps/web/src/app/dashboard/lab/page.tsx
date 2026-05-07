import { redirect } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'

/**
 * Laboratory surface.
 *
 * The schema for lab orders + lab results does not yet exist (tracked as
 * Phase 3b in docs/offline-first-refactor.md), so this page renders an
 * explicit empty state. The route + sidebar nav are live so the role can
 * be granted and the entry point is testable; the lab board lights up
 * once the data layer ships.
 */

export default async function LabPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <>
      <WebTopBar
        title="Lab board"
        subtitle="LABORATORY"
      />

      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div className="max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cobalt-soft text-cobalt mb-5">
            <FlaskConical className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">No lab orders yet</h2>
          <p className="text-base text-body leading-relaxed">
            The lab schema (lab orders, lab results, abnormal flags) is being built. When it lands,
            this page becomes the daily lab board: inline result entry per test type, status
            auto-advance, and abnormal-result callouts that ping the ordering clinician.
          </p>
          <p className="text-sm text-muted-foreground mt-4 font-mono">
            UPSTREAM · Phase 3b · docs/offline-first-refactor.md
          </p>
        </div>
      </div>
    </>
  )
}
