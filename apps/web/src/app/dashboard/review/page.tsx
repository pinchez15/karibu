import { getStaff } from '@/lib/auth'
import { fetchReviewNotesData } from '@/lib/review-notes'
import { redirect } from 'next/navigation'
import { WebTopBar } from '@/components/web-shell'
import { ReviewNotesWorkspace } from './ReviewNotesWorkspace'
import type { StaffRole } from '@karibu/shared'

export default async function ReviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { unfinalized, uncoded, periodLabel } = await fetchReviewNotesData(staff.clinic_id)
  const pendingCount = unfinalized.length + uncoded.length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WebTopBar
        title="Review Notes"
        subtitle={`${pendingCount} ${pendingCount === 1 ? 'item' : 'items'} · ${periodLabel}`}
        subtitleMeta={false}
      />
      <ReviewNotesWorkspace
        initialUnfinalized={unfinalized}
        initialUncoded={uncoded}
        periodLabel={periodLabel}
        staffRole={staff.role as StaffRole}
      />
    </div>
  )
}
