import { Lockup } from '@/components/brand'
import { SideLinks, TabLinks, type NavItem } from '@/components/Nav'
import { getMe, getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'

type Props = { children: React.ReactNode; params: Promise<{ office: string }> }

// One shell, two shapes: bottom tabs on a phone, a sidebar on a laptop. Every
// area is always listed; the stage shows progress and never hides anything.
export default async function OfficeLayout({ children, params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const [home, me] = await Promise.all([getHome(scope.office_id), getMe()])
  const base = `/o/${slug}`
  const stage = home.stage.stage
  const moneyBadge = home.invoices.overdue + home.unmatched_payments

  const main: NavItem[] = [
    { href: base, label: t('nav.today'), exact: true, badge: home.tasks.length },
    { href: `${base}/clinics`, label: t('nav.clinics') },
    { href: `${base}/support`, label: t('nav.support'), badge: home.open_tickets },
    { href: `${base}/money`, label: t('nav.money'), badge: moneyBadge },
  ]
  const office: NavItem[] = [
    { href: `${base}/guide`, label: t('nav.guide') },
    { href: `${base}/more/share`, label: t('more.share') },
    { href: `${base}/more/account`, label: t('more.account') },
    ...(me?.is_central ? [{ href: '/foundation', label: t('more.foundation') }] : []),
    { href: `${base}/more`, label: t('nav.settings'), exact: true },
  ]
  const tabs: NavItem[] = [...main.map((i) => ({ ...i, badge: i.exact ? undefined : i.badge })), { href: `${base}/more`, label: t('nav.more') }]
  const stageLabel = t('stage.short', { n: stage, name: t(`stage.name.${stage}`) })

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-3 py-5 lg:flex">
        <a href={base} className="px-3"><Lockup sub={home.office.name} /></a>
        <nav aria-label={t('nav.main')}><SideLinks items={main} /></nav>
        <nav aria-label={t('nav.office')} className="space-y-1">
          <p className="meta px-3">{t('nav.office')}</p>
          <SideLinks items={office} />
        </nav>
        <a href={`${base}/guide`} className="mt-auto block rounded-xl bg-cobalt-soft px-3 py-3 hover:bg-cobalt-soft/70">
          <span className="meta block text-cobalt">{t('stage.label', { n: stage })}</span>
          <span className="block font-semibold text-cobalt-ink">{t(`stage.name.${stage}`)}</span>
          <span className="mt-1 block text-sm text-cobalt-deep">{t('stage.seeGuide')} →</span>
        </a>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <a href={base} className="min-w-0"><Lockup sub={home.office.name} /></a>
          <a href={`${base}/guide`} className="chip-info shrink-0">{stageLabel}</a>
        </header>

        <main className="page mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-28 pt-5 lg:max-w-6xl lg:space-y-6 lg:px-10 lg:pb-16 lg:pt-8">
          {children}
        </main>

        <nav
          aria-label={t('nav.main')}
          className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <TabLinks items={tabs} />
        </nav>
      </div>
    </div>
  )
}
