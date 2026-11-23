import { PRICE_BOOKS } from '@karibu/shared'
import { Flash, PageHeader } from '@/components/ui'
import { t } from '@/i18n'
import { createOfficeAction } from '../../actions'

type Props = { searchParams: Promise<{ error?: string }> }

export default async function NewOfficePage({ searchParams }: Props) {
  const { error } = await searchParams
  return (
    <>
      <PageHeader title={t('foundation.newOffice')} back="/foundation" />
      <Flash error={error} />
      <form action={createOfficeAction} className="space-y-4">
        <label className="field"><span>{t('foundation.form.name')}</span><input name="name" required className="input" placeholder="Karibu Mbarara" /></label>
        <label className="field">
          <span>{t('foundation.form.slug')}</span>
          <input name="slug" required pattern="[a-z0-9-]{2,40}" className="input" placeholder="mbarara" />
          <span className="mt-1 block text-xs text-muted">{t('foundation.slugHint')}</span>
        </label>
        <label className="field">
          <span>{t('foundation.form.country')}</span>
          <select name="country" className="input">
            {Object.values(PRICE_BOOKS).map((b) => <option key={b.country} value={b.country}>{b.countryName} ({b.currency})</option>)}
          </select>
        </label>
        <label className="field"><span>{t('foundation.form.territory')}</span><input name="territory" required className="input" /></label>
        <label className="field"><span>{t('foundation.form.prefix')}</span><input name="invoice_prefix" maxLength={4} className="input" placeholder="KM" /></label>
        <label className="field"><span>{t('foundation.form.inquiryEmail')}</span><input name="inquiry_email" type="email" className="input" /></label>
        <button className="btn-primary w-full">{t('foundation.create')}</button>
      </form>
    </>
  )
}
