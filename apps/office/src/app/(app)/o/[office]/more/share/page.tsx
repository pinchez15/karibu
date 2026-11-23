import { PageHeader, Section, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { ehrUrl } from '@/lib/share'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }> }

export default async function SharePage({ params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const { office } = await getHome(scope.office_id)
  const pageUrl = ehrUrl(`/local/${office.slug}`)
  const sender = office.contact_name ?? office.public_profile.name ?? office.name
  const message = t('share.message', { name: sender, office: office.name, url: pageUrl })
  const base = `/o/${slug}/more/share`

  return (
    <>
      <PageHeader title={t('share.title')} back={`/o/${slug}/more`} />

      <Section title={t('share.pageTitle')}>
        <div className="card space-y-3">
          <p className="break-all font-mono text-sm text-ink">{pageUrl}</p>
          <p className="text-sm">{t('share.pageHint')}</p>
          <p className="rounded-lg bg-line-soft p-3 text-sm text-ink">{message}</p>
          <WhatsAppButton text={message} className="btn-whatsapp w-full" />
        </div>
      </Section>

      <Section title={t('share.flyer')}>
        <div className="card space-y-3">
          <p className="text-sm">{t('share.flyerHint')}</p>
          <a href={`${base}/flyer`} className="btn-secondary w-full">{t('share.openFlyer')}</a>
        </div>
      </Section>

      <Section title={t('share.pitch')}>
        <div className="card">
          <a href={`${base}/pitch`} className="btn-secondary w-full">{t('share.openPitch')}</a>
        </div>
      </Section>
    </>
  )
}
