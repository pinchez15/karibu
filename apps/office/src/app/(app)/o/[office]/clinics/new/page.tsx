import { EDITIONS, EDITION_IDS } from '@karibu/shared'
import { Flash, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { t } from '@/i18n'
import { createClinicAction } from '../actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ error?: string; conflict?: string }> }

export default async function NewClinicPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { error, conflict } = await searchParams
  await getOfficeScope(slug)

  return (
    <>
      <PageHeader title={t('clinics.add')} back={`/o/${slug}/clinics`} />
      <Flash error={error} />
      {conflict !== undefined ? (
        <div className="notice-warning space-y-1">
          <p className="font-semibold">{t('clinics.conflictTitle')}{conflict ? `: ${conflict}` : ''}</p>
          <p>{t('clinics.conflictBody')}</p>
        </div>
      ) : null}

      <form action={createClinicAction.bind(null, slug)} className="space-y-4">
        <label className="field">
          <span>{t('clinics.form.name')}</span>
          <input name="name" required className="input" placeholder={t('clinics.form.nameHint')} autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('clinics.form.district')}</span>
          <input name="district" required className="input" autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('clinics.form.level')} ({t('common.optional')})</span>
          <select name="facility_level" className="input" defaultValue="">
            <option value="">—</option>
            {['HC II', 'HC III', 'HC IV', 'Private clinic', 'Hospital', 'Other'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>{t('clinics.form.contactName')} ({t('common.optional')})</span>
            <input name="contact_name" className="input" />
          </label>
          <label className="field">
            <span>{t('clinics.form.contactPhone')} ({t('common.optional')})</span>
            <input name="contact_phone" type="tel" inputMode="tel" className="input" placeholder="+256 7…" />
          </label>
        </div>
        <label className="field">
          <span>{t('clinics.form.tier')} ({t('common.optional')})</span>
          <select name="tier" className="input" defaultValue="">
            <option value="">{t('clinics.form.tierNone')}</option>
            {EDITION_IDS.map((id) => <option key={id} value={id}>{EDITIONS[id].name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('clinics.form.notes')} ({t('common.optional')})</span>
          <textarea name="notes" rows={3} className="input" />
        </label>
        <button className="btn-primary w-full">{t('clinics.add')}</button>
      </form>
    </>
  )
}
