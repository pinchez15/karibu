import { notFound } from 'next/navigation'
import { Flash, PageHeader, Section, WhatsAppButton } from '@/components/ui'
import { shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { officeUrl } from '@/lib/share'
import { t } from '@/i18n'
import { inviteOwnerAction, markFeeAction, saveOfficeAction } from '../../actions'
import type { Overview } from '../../types'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string; join?: string; phone?: string }>
}

export default async function OfficeAdminPage({ params, searchParams }: Props) {
  const { id } = await params
  const { join, phone, ...flash } = await searchParams
  const data = await rpc<Overview>('office_admin_overview')
  const o = data.offices.find((x) => x.id === id)
  if (!o) notFound()
  const save = saveOfficeAction.bind(null, id)
  const joinUrl = join ? officeUrl(`/join/${join}`) : null

  return (
    <>
      <PageHeader title={o.name} back="/foundation" action={<a href={`/o/${o.slug}`} className="btn-secondary shrink-0">{t('foundation.open')}</a>} />
      <p className="text-sm">{o.territory} · {t('foundation.clinics', { n: o.clinics })} · {t(`foundation.status.${o.status}`)}</p>
      <Flash {...flash} />

      <div className="grid gap-2 sm:grid-cols-2">
        <form action={save}>
          <input type="hidden" name="status" value={o.status === 'active' ? 'suspended' : 'active'} />
          <button className={o.status === 'active' ? 'btn-danger w-full' : 'btn-primary w-full'}>
            {o.status === 'active' ? t('foundation.suspend') : t('foundation.activate')}
          </button>
        </form>
        <form action={save}>
          <input type="hidden" name="certified" value={o.certified_at ? 'false' : 'true'} />
          <button className="btn-secondary w-full">{o.certified_at ? t('foundation.uncertify') : t('foundation.certify')}</button>
        </form>
      </div>
      {o.certified_at ? <p className="text-sm text-green">{t('account.certified', { date: shortDate(o.certified_at) })}</p> : null}

      <Section title={t('foundation.owner')}>
        {o.owner ? (
          <p className="card text-sm text-ink">{o.owner.name}{o.owner.joined ? '' : ` · ${t('foundation.ownerPending')}`}</p>
        ) : null}
        {joinUrl ? (
          <div className="notice-success space-y-2">
            <p className="font-semibold">{t('foundation.joinLink')}</p>
            <p className="break-all font-mono text-sm">{joinUrl}</p>
            <WhatsAppButton text={t('foundation.joinMessage', { office: o.name, url: joinUrl })} phone={phone} className="btn-whatsapp w-full" />
          </div>
        ) : null}
        {!o.owner?.joined ? (
          <form action={inviteOwnerAction.bind(null, id)} className="card space-y-3">
            <label className="field"><span>{t('foundation.ownerName')}</span><input name="display_name" required className="input" defaultValue={o.owner?.name ?? ''} /></label>
            <label className="field"><span>{t('account.contactPhone')} ({t('common.optional')})</span><input name="phone" type="tel" inputMode="tel" className="input" /></label>
            <button className="btn-secondary w-full">{t('foundation.inviteOwner')}</button>
          </form>
        ) : null}
      </Section>

      <Section title={t('foundation.feeTitle')} action={<span className="chip-neutral">{t(`account.feeStatus.${o.fee_status}`)}</span>}>
        <form action={save} className="card space-y-3">
          <p className="text-sm">{t('account.feeAmount', { amount: money(o.fee_amount, o.currency) })}</p>
          <label className="field">
            <span>{t('foundation.feeStart')}</span>
            <input name="fee_starts_on" type="date" defaultValue={o.fee_starts_on ?? ''} className="input" />
            <span className="mt-1 block text-xs text-muted">{t('foundation.feeStartHint')}</span>
          </label>
          <button className="btn-secondary w-full">{t('common.save')}</button>
        </form>
        {o.fee_starts_on ? (
          <form action={markFeeAction.bind(null, id)} className="card space-y-3">
            <h3>{t('foundation.feeMark')}{o.fee_months_due > 0 ? ` · ${t('foundation.feeMonthsDue', { n: o.fee_months_due })}` : ''}</h3>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <label className="field"><span>{t('foundation.months')}</span><input name="months" type="number" min={1} max={24} defaultValue={Math.max(1, o.fee_months_due)} className="input" /></label>
              <label className="field"><span>{t('foundation.reference')}</span><input name="reference" className="input" autoComplete="off" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button name="status" value="paid" className="btn-primary">{t('foundation.markPaid')}</button>
              <button name="status" value="waived" className="btn-secondary">{t('foundation.waive')}</button>
            </div>
          </form>
        ) : null}
      </Section>

      <Section title={t('foundation.stageOverride')}>
        <form action={save} className="card space-y-3">
          <p className="text-sm">{t('foundation.stageOverrideHint')}</p>
          <select name="stage_override" defaultValue={o.stage.overridden ? String(o.stage.stage) : ''} className="input">
            <option value="">{t('foundation.stageDerived', { n: o.stage.derived_stage })}</option>
            {([1, 2, 3, 4, 5] as const).map((n) => <option key={n} value={n}>{n}. {t(`stage.name.${n}`)}</option>)}
          </select>
          <button className="btn-secondary w-full">{t('common.save')}</button>
        </form>
      </Section>

      <Section title={t('foundation.grants')}>
        <a href={`/foundation/offices/${id}/grants`} className="card block font-semibold text-ink">{t('foundation.grants')} →</a>
      </Section>
    </>
  )
}
