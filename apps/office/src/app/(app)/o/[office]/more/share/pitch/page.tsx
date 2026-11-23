import { ANNUAL_MONTHS_CHARGED, EDITIONS, EDITION_IDS, PRICE_BOOKS, formatMoney } from '@karibu/shared'
import { KMark } from '@/components/brand'
import { PrintButton } from '@/components/PrintButton'
import { PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { getHome } from '@/lib/office'
import { qrSvg } from '@/lib/qr'
import { ehrUrl } from '@/lib/share'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }> }

/** One page a partner can hand to a clinic: the local price book, straight from packages/shared. */
export default async function PitchPage({ params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const { office } = await getHome(scope.office_id)
  const book = PRICE_BOOKS[office.country]
  const pageUrl = ehrUrl(`/local/${office.slug}`)
  const qr = await qrSvg(pageUrl)

  return (
    <>
      <div className="no-print"><PageHeader title={t('share.pitch')} back={`/o/${slug}/more/share`} /></div>

      <article className="space-y-5 rounded-2xl border border-line bg-white p-6 print:border-0 print:p-0">
        <div className="flex items-center gap-2.5">
          <KMark size={34} />
          <div>
            <p className="font-semibold text-ink">{office.name}</p>
            <p className="text-sm">{t('share.pitchTitle')}</p>
          </div>
        </div>

        <ul className="space-y-3">
          {EDITION_IDS.map((id) => (
            <li key={id} className="rounded-xl border border-line p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3>{EDITIONS[id].name}</h3>
                <p className="text-right font-semibold text-ink">
                  {formatMoney(book.monthly[id], book.currency)} <span className="text-sm font-normal text-muted">{t('share.perMonth')}</span>
                </p>
              </div>
              <p className="text-sm">{EDITIONS[id].audience}</p>
              <p className="mt-1 text-sm text-muted">{EDITIONS[id].includes.join(' · ')}</p>
              <p className="mt-1 text-xs text-muted">
                {formatMoney(book.monthly[id] * ANNUAL_MONTHS_CHARGED, book.currency)} {t('share.perYear')}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-sm text-ink">{t('share.setup')}: <strong>{formatMoney(book.setup, book.currency)}</strong></p>

        <div className="flex items-center gap-4 border-t border-line pt-4">
          <div className="w-24 shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">{[office.contact_name, office.contact_phone].filter(Boolean).join(' · ') || office.name}</p>
            <p className="break-all font-mono text-xs">{pageUrl.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </article>

      <PrintButton label={t('share.print')} />
    </>
  )
}
