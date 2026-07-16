import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { loadBriefing } from '@/lib/dashboard-briefing'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { BriefingDashboard } from './BriefingDashboard'

/**
 * Home — the clinic-wide briefing dashboard. Whole-clinic status at a glance
 * (big day vs small day, what needs to happen at every desk). The full month
 * calendar moved to /dashboard/calendar.
 */
export default async function DashboardPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const data = await loadBriefing(staff.clinic_id)

  return (
    <>
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <WebTopBar title="Today at the clinic" subtitle={data.dateLabel} subtitleMeta={false} />
      <BriefingDashboard data={data} />
    </>
  )
}
