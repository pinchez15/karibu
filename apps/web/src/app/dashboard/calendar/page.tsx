import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { loadClinicAppointments } from '@/lib/calendar-load'
import { WebTopBar } from '@/components/web-shell'
import { ClinicCalendar } from '@/components/clinic-calendar/ClinicCalendar'
import { formatClinicDate } from '@/lib/format-clinic-date'

export default async function CalendarPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const appointments = await loadClinicAppointments(staff.clinic_id, {
    daysBack: 14,
    daysForward: 90,
  })

  return (
    <>
      <WebTopBar
        title="Calendar"
        subtitle={formatClinicDate()}
        subtitleMeta={false}
      />
      <div className="p-6 overflow-auto flex-1">
        <ClinicCalendar variant="full" initialAppointments={appointments} />
      </div>
    </>
  )
}
