import { Lockup } from '@/components/brand'
import { t } from '@/i18n'

export const dynamic = 'force-static'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Lockup />
      <p className="notice-warning">{t('errors.offline')}</p>
    </main>
  )
}
