import { Lockup } from '@/components/brand'
import { requireCentral } from '@/lib/auth'
import { t } from '@/i18n'

export default async function FoundationLayout({ children }: { children: React.ReactNode }) {
  await requireCentral()
  return (
    <div className="mx-auto min-h-screen max-w-3xl">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <a href="/foundation"><Lockup sub={t('foundation.title')} /></a>
      </header>
      <main className="space-y-5 px-4 pb-16 pt-5">{children}</main>
    </div>
  )
}
