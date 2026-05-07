import { redirect } from 'next/navigation'
import { Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'

/**
 * Pharmacy dispensing surface.
 *
 * The schema for prescriptions, dispense records, formulary, and stock
 * does not yet exist (tracked as Phase 3c in docs/offline-first-refactor.md),
 * so this page renders an explicit empty state. The route + sidebar nav are
 * live so the role can be granted and the entry point is testable; the
 * dispensing board lights up once the data layer ships.
 */

export default async function PharmacyPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <>
      <WebTopBar
        title="Dispensing board"
        subtitle="PHARMACY"
      />

      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div className="max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cobalt-soft text-cobalt mb-5">
            <Pill className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">No prescriptions yet</h2>
          <p className="text-base text-body leading-relaxed">
            The pharmacy schema (prescriptions, dispense records, formulary, stock) is being built.
            When it lands, this page becomes the daily dispensing board: today's drug load matrix,
            stock burn-down, low-stock alerts, and one-tap status advance.
          </p>
          <p className="text-sm text-muted-foreground mt-4 font-mono">
            UPSTREAM · Phase 3c · docs/offline-first-refactor.md
          </p>
        </div>
      </div>
    </>
  )
}
