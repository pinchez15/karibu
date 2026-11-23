import { redirect } from 'next/navigation'
import { getMe } from '@/lib/auth'

export default async function Page() {
  const me = await getMe()
  if (!me) redirect('/sign-in')
  if (me.memberships.length > 0) redirect(`/o/${me.memberships[0].slug}`)
  if (me.is_central) redirect('/foundation')
  redirect('/no-office')
}
