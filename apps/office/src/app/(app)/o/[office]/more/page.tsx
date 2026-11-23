import { SignOut } from '@/components/SignOut'
import { PageHeader } from '@/components/ui'
import { getMe, getOfficeScope } from '@/lib/auth'
import { isLowData } from '@/lib/prefs'
import { t } from '@/i18n'
import { setLowDataAction } from '../actions'

type Props = { params: Promise<{ office: string }> }

export default async function MorePage({ params }: Props) {
  const { office: slug } = await params
  await getOfficeScope(slug)
  const me = await getMe()
  const lowData = await isLowData()
  const base = `/o/${slug}/more`
  const others = (me?.memberships ?? []).filter((m) => m.slug !== slug)

  return (
    <>
      <PageHeader title={t('more.title')} />
      <ul className="card divide-y divide-line-soft p-0">
        <li><a className="block px-4 py-4 font-semibold text-ink" href={`${base}/account`}>{t('more.account')} →</a></li>
        <li><a className="block px-4 py-4 font-semibold text-ink" href={`${base}/share`}>{t('more.share')} →</a></li>
        {me?.is_central ? <li><a className="block px-4 py-4 font-semibold text-ink" href="/foundation">{t('more.foundation')} →</a></li> : null}
        {others.map((m) => (
          <li key={m.office_id}><a className="block px-4 py-4 font-semibold text-ink" href={`/o/${m.slug}`}>{t('more.switchOffice')}: {m.name} →</a></li>
        ))}
      </ul>

      <form action={setLowDataAction.bind(null, slug)} className="card flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-ink">{t('more.lowData')}</span>
          <span className="block text-sm">{t('more.lowDataHint')}</span>
        </span>
        <input type="hidden" name="on" value={lowData ? '0' : '1'} />
        <button className={lowData ? 'btn-primary shrink-0' : 'btn-secondary shrink-0'} aria-pressed={lowData}>
          {lowData ? t('more.lowDataOn') : t('more.lowDataOff')}
        </button>
      </form>

      <SignOut label={t('common.signOut')} />
    </>
  )
}
