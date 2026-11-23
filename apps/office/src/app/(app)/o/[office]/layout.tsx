import { Lockup } from '@/components/brand'
import { getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { navFor } from '@/lib/stage'
import { t } from '@/i18n'

type Props = { children: React.ReactNode; params: Promise<{ office: string }> }

export default async function OfficeLayout({ children, params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const home = await getHome(scope.office_id)
  const base = `/o/${slug}`
  const nav = navFor(home.stage.stage)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <a href={base} className="min-w-0"><Lockup sub={home.office.name} /></a>
        <span className="chip-info shrink-0">{t(`stage.name.${home.stage.stage}`)}</span>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-28 pt-5">{children}</main>

      {/* Only what this stage has unlocked. The next unlock is spelled out on Today. */}
      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl">
          {nav.map((item) => (
            <li key={item.key} className="flex-1">
              <a
                href={`${base}${item.href}`}
                className="flex min-h-[56px] flex-col items-center justify-center text-[13px] font-semibold text-body active:bg-line-soft"
              >
                {t(`nav.${item.key}`)}
                {item.key === 'support' && home.open_tickets > 0 ? (
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red" aria-label={String(home.open_tickets)} />
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
