import { Lockup } from '@/components/brand'
import { Icon } from '@/components/icons'
import { SideLinks, TabLinks, type NavItem } from '@/components/Nav'
import { getMe, getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'

type Props = { children: React.ReactNode; params: Promise<{ office: string }> }

// One shell, two shapes. A laptop gets a sidebar that follows the partner's
// job in order (grow, deliver, business) and a top bar with search and New.
// A phone gets five bottom tabs; everything else is under More.
export default async function OfficeLayout({ children, params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const [home, me] = await Promise.all([getHome(scope.office_id), getMe()])
  const base = `/o/${slug}`
  const stage = home.stage.stage
  const moneyBadge = home.invoices.overdue + home.unmatched_payments

  // No count on Home: its list also holds payments and follow-ups, which this layout does not load.
  const top: NavItem[] = [{ href: base, label: t('shell.home'), icon: 'home', exact: true }]
  const grow: NavItem[] = [
    { href: `${base}/leads`, label: t('shell.leads'), icon: 'leads' },
    { href: `${base}/pipeline`, label: t('shell.pipeline'), icon: 'pipeline', badge: home.counts.pipeline },
  ]
  const deliver: NavItem[] = [
    { href: `${base}/onboarding`, label: t('shell.onboarding'), icon: 'onboarding', badge: home.counts.onboarding },
    { href: `${base}/clinics`, label: t('nav.clinics'), icon: 'clinics', badge: home.counts.live },
    { href: `${base}/support`, label: t('nav.support'), icon: 'support', badge: home.open_tickets, urgent: true },
  ]
  const business: NavItem[] = [
    { href: `${base}/money`, label: t('nav.money'), icon: 'money', badge: moneyBadge, urgent: true, except: [`${base}/money/cashflow`] },
    { href: `${base}/money/cashflow`, label: t('shell.cashflow'), icon: 'cashflow' },
    { href: `${base}/analytics`, label: t('shell.analytics'), icon: 'analytics' },
  ]
  const office: NavItem[] = [
    { href: `${base}/guide`, label: t('nav.guide'), icon: 'guide' },
    { href: `${base}/more/share`, label: t('more.share'), icon: 'share' },
    ...(me?.is_central ? [{ href: '/foundation', label: t('more.foundation'), icon: 'foundation' as const }] : []),
    { href: `${base}/more`, label: t('nav.settings'), icon: 'settings', except: [`${base}/more/share`] },
  ]
  const groups: [string | null, NavItem[]][] = [
    [null, top], [t('shell.grow'), grow], [t('shell.deliver'), deliver], [t('shell.business'), business], [t('nav.office'), office],
  ]

  // On a phone the Clinics tab stands for everything about clinics, and More holds the rest.
  const tabs: NavItem[] = [
    { href: base, label: t('nav.today'), icon: 'home', exact: true },
    { href: `${base}/clinics`, label: t('nav.clinics'), icon: 'clinics', also: [`${base}/pipeline`, `${base}/onboarding`, `${base}/leads`] },
    { href: `${base}/support`, label: t('nav.support'), icon: 'support', badge: home.open_tickets, urgent: true },
    { href: `${base}/money`, label: t('nav.money'), icon: 'money', badge: moneyBadge, urgent: true },
    { href: `${base}/more`, label: t('nav.more'), icon: 'more', also: [`${base}/analytics`, `${base}/guide`] },
  ]

  const newItems: [string, string][] = [
    [t('shell.newClinic'), `${base}/clinics/new`],
    [t('shell.newImport'), `${base}/clinics/import`],
    [t('shell.newInvoice'), `${base}/money/invoices/new`],
    [t('shell.newPayment'), `${base}/money#record`],
    [t('shell.newCost'), `${base}/money/cashflow#costs`],
  ]

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-background px-3 py-4 lg:flex">
        <a href={base} className="px-2"><Lockup sub={home.office.name} /></a>
        {groups.map(([label, items], i) => (
          <nav key={i} aria-label={label ?? t('nav.main')} className="space-y-1">
            {label ? <p className="meta px-3 text-[11px]">{label}</p> : null}
            <SideLinks items={items} />
          </nav>
        ))}
        <a href={`${base}/guide`} className="mt-auto block rounded-2xl border border-line bg-surface px-3 py-3 hover:border-ink/30">
          <span className="block text-xs text-muted">{t('stage.label', { n: stage })}</span>
          <span className="block text-sm font-semibold text-ink">{t(`stage.name.${stage}`)}</span>
          <span aria-hidden className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= stage ? 'bg-coral-bright' : 'bg-line'}`} />)}
          </span>
          <span className="mt-2 block text-xs font-medium text-coral">{t('shell.stageNext')}</span>
        </a>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-surface">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:px-8">
          <a href={base} className="min-w-0 lg:hidden"><Lockup sub={home.office.name} /></a>
          <form action={`${base}/clinics`} role="search" className="hidden max-w-md flex-1 lg:block">
            <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-background px-4 text-muted focus-within:border-coral focus-within:ring-2 focus-within:ring-coral-soft">
              <Icon name="search" size={16} />
              <input
                type="search" name="q" aria-label={t('shell.searchLabel')} placeholder={t('shell.search')}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-0"
                style={{ fontSize: 14 }}
              />
            </label>
          </form>
          <span className="flex-1 lg:hidden" />
          <details className="relative ml-auto">
            <summary className="btn-primary btn-sm min-h-[40px] list-none px-4 py-2 text-sm">
              <Icon name="plus" size={16} /> {t('shell.new')}
            </summary>
            <ul className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg">
              {newItems.map(([label, href]) => (
                <li key={href}><a href={href} className="block px-4 py-2.5 text-sm font-medium text-ink hover:bg-line-soft">{label}</a></li>
              ))}
            </ul>
          </details>
        </header>

        <main className="page mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-28 pt-5 lg:mx-0 lg:max-w-[1240px] lg:space-y-6 lg:px-8 lg:pb-16 lg:pt-7">
          {children}
        </main>

        <nav
          aria-label={t('nav.main')}
          className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <TabLinks items={tabs} />
        </nav>
      </div>
    </div>
  )
}
