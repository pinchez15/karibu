import { redirect } from 'next/navigation'

/** Legacy route — calendar is the shared homepage at /dashboard. */
export default function CalendarPage() {
  redirect('/dashboard')
}
