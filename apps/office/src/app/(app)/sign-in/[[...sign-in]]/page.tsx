import { SignIn } from '@clerk/nextjs'
import { Lockup } from '@/components/brand'
import { t } from '@/i18n'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <Lockup />
      <h1 className="text-center text-xl">{t('signIn.title')}</h1>
      <SignIn fallbackRedirectUrl="/" />
      <p className="text-center text-sm text-muted">{t('signIn.note')}</p>
    </main>
  )
}
