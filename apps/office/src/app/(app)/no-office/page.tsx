import { SignOutButton } from '@clerk/nextjs'
import { Lockup } from '@/components/brand'
import { ehrUrl } from '@/lib/share'
import { t } from '@/i18n'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Lockup />
      <h1>{t('noOffice.title')}</h1>
      <p>{t('noOffice.body')}</p>
      <a className="btn-secondary" href={ehrUrl('/')}>{t('noOffice.ehr')}</a>
      <SignOutButton><button className="btn-quiet">{t('common.signOut')}</button></SignOutButton>
    </main>
  )
}
