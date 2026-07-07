import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { loadClinicAppointments } from '@/lib/calendar-load'
import { formatClinicDate } from '@/lib/format-clinic-date'
import { WebTopBar } from '@/components/web-shell'
import { ClinicCalendar } from '@/components/clinic-calendar/ClinicCalendar'

export default async function DashboardPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const appointments = await loadClinicAppointments(staff.clinic_id, {
    daysBack: 14,
    daysForward: 28,
  })

  return (
    <>
      <WebTopBar title="Calendar" subtitle={formatClinicDate()} subtitleMeta={false} />
      <div className="flex-1 overflow-auto p-6">
        <ClinicCalendar initialAppointments={appointments} />
      </div>
    </>
  )
}
