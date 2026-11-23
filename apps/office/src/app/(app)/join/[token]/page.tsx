import { redirect } from 'next/navigation'
import { Lockup } from '@/components/brand'
import { rpc } from '@/lib/db'
import { getMe } from '@/lib/auth'
import { errorMessage } from '@/lib/form'
import { t } from '@/i18n'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }

export default async function Page({ params, searchParams }: Props) {
  const { token } = await params
  const { error } = await searchParams

  async function accept() {
    'use server'
    let failure: string | null = null
    try {
      await rpc('office_member_accept', { p_token: token })
    } catch (e) {
      failure = errorMessage(e, t)
    }
    if (failure) redirect(`/join/${token}?error=${encodeURIComponent(failure)}`)
    const me = await getMe()
    redirect(me?.memberships[0] ? `/o/${me.memberships[0].slug}` : '/')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Lockup />
      <h1>{t('join.title')}</h1>
      <p>{t('join.body')}</p>
      {error ? <p className="notice-danger">{error}</p> : null}
      <form action={accept}>
        <button className="btn-primary w-full">{t('join.accept')}</button>
      </form>
    </main>
  )
}
