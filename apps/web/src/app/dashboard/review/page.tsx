import { getStaff } from '@/lib/auth'
import { fetchReviewNotesData } from '@/lib/review-notes'
import { redirect } from 'next/navigation'
import { WebTopBar } from '@/components/web-shell'
import { ReviewNotesList } from './ReviewNotesList'

export default async function ReviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { unfinalized, uncoded, periodLabel } = await fetchReviewNotesData(staff.clinic_id)
  const pendingCount = unfinalized.length + uncoded.length

  return (
    <>
      <WebTopBar
        title="Review Notes"
        subtitle={`${pendingCount} ${pendingCount === 1 ? 'item' : 'items'} · ${periodLabel}`}
        subtitleMeta={false}
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <ReviewNotesList
          unfinalized={unfinalized}
          uncoded={uncoded}
          periodLabel={periodLabel}
        />
      </div>
    </>
  )
}
