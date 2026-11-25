import { KMark } from '@/components/brand'
import { PrintButton } from '@/components/PrintButton'
import { PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { qrSvg } from '@/lib/qr'
import { ehrUrl } from '@/lib/share'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }> }

export default async function FlyerPage({ params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const { office } = await getHome(scope.office_id)
  const pageUrl = ehrUrl(`/local/${office.slug}`)
  const qr = await qrSvg(pageUrl)
  const phone = office.contact_phone

  return (
    <>
      <div className="no-print"><PageHeader title={t('share.flyer')} back={`/o/${slug}/more/share`} /></div>

      {/* Vector only: prints sharp on A5 or A4 and costs a few KB to load. */}
      <article className="overflow-hidden rounded-2xl border border-line bg-white print:rounded-none print:border-0">
        <div className="space-y-4 bg-coral-ink p-6 text-white">
          <div className="flex items-center gap-2.5">
            <KMark size={36} color="#FFFFFF" fg="rgb(var(--ko-coral))" />
            <span className="text-lg font-semibold">{office.name}</span>
          </div>
          <p className="text-[26px] font-semibold leading-tight tracking-tight">
            {t('share.flyerHeadline', { territory: office.territory })}
          </p>
        </div>
        <div className="flex items-center gap-5 p-6">
          <div className="w-36 shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 space-y-2">
            <p className="text-lg font-semibold text-ink">{t('share.flyerScan')}</p>
            <p className="break-all font-mono text-xs">{pageUrl.replace(/^https?:\/\//, '')}</p>
            {office.contact_name || phone ? (
              <p className="text-sm text-ink">{[office.contact_name, phone].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
        </div>
      </article>

      <PrintButton label={t('share.print')} />
    </>
  )
}
