import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WorkspaceTopBar } from '@/components/workspace-top-bar'
import { PharmacyStationClient } from './PharmacyStationClient'
import { PharmacyTabs } from './PharmacyTabs'
import { getPharmacyStationQueue, getPharmacyTabCounts } from './pharmacy-data'
import { formatOldestWait } from './pharmacy-shared'
import type { PharmacyQueueTab } from '@karibu/shared'

const VALID_TABS: PharmacyQueueTab[] = ['waiting', 'in_progress', 'done_today']

function parseTab(raw: string | undefined): PharmacyQueueTab {
  if (raw && VALID_TABS.includes(raw as PharmacyQueueTab)) {
    return raw as PharmacyQueueTab
  }
  return 'waiting'
}

export default async function PharmacyPage({
  searchParams,
}: {
  searchParams: Promise<{ visit?: string; tab?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const tab = parseTab(params.tab)
  const [queue, counts] = await Promise.all([
    getPharmacyStationQueue(staff.clinic_id, tab),
    getPharmacyTabCounts(staff.clinic_id),
  ])
  const oldestSubmitted = queue[0]?.pharmacy_order_submitted_at ?? null

  return (
    <>
      <WorkspaceTopBar
        title="Today"
        roleLabel="PHARMACY · DISPENSING"
        awaiting={counts.waiting + counts.in_progress}
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
        <Suspense fallback={<div className="mb-4 h-9" />}>
          <PharmacyTabs active={tab} counts={counts} />
        </Suspense>

        {queue.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="max-w-lg text-center">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-cobalt-soft text-cobalt">
                <Pill className="h-7 w-7" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold tracking-tight">
                {tab === 'done_today' ? 'Nothing dispensed yet today' : 'No prescriptions in this queue'}
              </h2>
              <p className="text-base leading-relaxed text-body">
                {tab === 'waiting'
                  ? 'Visits appear here after the clinician submits structured prescriptions (note may still be open).'
                  : tab === 'in_progress'
                    ? 'Start a dispense from Waiting — in-progress visits show here.'
                    : 'Completed dispenses from today will appear here for review.'}
              </p>
            </div>
          </div>
        ) : (
          <PharmacyStationClient
            initialRows={queue}
            initialVisitId={params.visit ?? null}
            activeTab={tab}
          />
        )}
      </div>
    </>
  )
}
