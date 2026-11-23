import { redirect } from 'next/navigation'
import { PRICE_BOOKS } from '@karibu/shared'
import { GrantList } from '@/components/GrantList'
import { Flash, PageHeader, Section } from '@/components/ui'
import type { Grant } from '@/lib/grants'
import { getOfficeScope } from '@/lib/auth'
import { monthLabel, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import type { FeeStatus } from '@/lib/types'
import { t } from '@/i18n'

type Ledger = {
  status: FeeStatus
  grace_days: number
  periods: { period: string; amount: number; currency: string; status: 'due' | 'paid' | 'waived'; reference: string | null }[]
}

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

const FEE_CHIP: Record<FeeStatus, string> = { not_started: 'chip-neutral', current: 'chip-success', due: 'chip-warning', lapsed: 'chip-danger' }
const PERIOD_CHIP = { due: 'chip-warning', paid: 'chip-success', waived: 'chip-neutral' } as const

export default async function AccountPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const { office } = await getHome(scope.office_id)
  const isOwner = scope.role === 'owner' || scope.role === 'central'
  const ledger = isOwner ? await rpc<Ledger>('office_fee_ledger', { p_office_id: scope.office_id }) : null
  const grants = isOwner ? await rpc<Grant[]>('office_grants', { p_office_id: scope.office_id }).catch(() => []) : []
  const path = `/o/${slug}/more/account`

  async function save(form: FormData) {
    'use server'
    let failure: string | null = null
    try {
      await rpc('office_update_profile', {
        p_office_id: scope.office_id,
        p_patch: {
          legal_name: text(form, 'legal_name'),
          contact_name: text(form, 'contact_name'),
          contact_phone: text(form, 'contact_phone'),
          contact_email: text(form, 'contact_email'),
          payout_details: {
            momo_mtn: text(form, 'momo_mtn'),
            airtel: text(form, 'airtel'),
            bank: text(form, 'bank'),
            account_name: text(form, 'account_name'),
          },
        },
      })
    } catch (e) {
      failure = errorMessage(e, t)
    }
    redirect(`${path}?${new URLSearchParams(failure ? { error: failure } : { ok: t('common.saved') })}`)
  }

  return (
    <>
      <PageHeader title={t('account.title')} back={`/o/${slug}/more`} />
      <Flash {...flash} />

      <Section title={t('account.certification')}>
        <div className="card">
          {office.certified_at ? (
            <p className="font-semibold text-green">{t('account.certified', { date: shortDate(office.certified_at) })}</p>
          ) : (
            <>
              <p className="font-semibold text-ink">{t('account.notCertified')}</p>
              <p className="text-sm">{t('account.notCertifiedHint')}</p>
            </>
          )}
        </div>
      </Section>

      {ledger ? (
        <Section title={t('account.fee')} action={<span className={FEE_CHIP[ledger.status]}>{t(`account.feeStatus.${ledger.status}`)}</span>}>
          <div className="card space-y-2 text-sm">
            <p className="text-base font-semibold text-ink">{t('account.feeAmount', { amount: money(office.fee_amount, office.currency) })}</p>
            <p>{t('account.feeFund', { country: PRICE_BOOKS[office.country]?.countryName ?? office.country })}</p>
            <p>{t('account.feeHow')}</p>
            <p className="text-muted">{t('account.feeLapseRule', { days: ledger.grace_days })}</p>
          </div>
          {ledger.periods.length > 0 ? (
            <ul className="card divide-y divide-line-soft py-1">
              {ledger.periods.map((p) => (
                <li key={p.period} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="text-ink">{monthLabel(p.period)}</span>
                  <span className="flex items-center gap-2">
                    {p.reference ? <span className="meta">{p.reference}</span> : null}
                    <span className={PERIOD_CHIP[p.status]}>{t(`account.period.${p.status}`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}

      {grants.length > 0 ? (
        <Section title={t('grants.title')}>
          <p className="text-sm">{t('grants.verifiedHow')}</p>
          <GrantList grants={grants} />
        </Section>
      ) : null}

      <Section title={t('account.profile')}>
        <form action={save} className="card space-y-4">
          <fieldset disabled={!isOwner} className="space-y-4">
            <label className="field"><span>{t('account.legalName')}</span><input name="legal_name" defaultValue={office.legal_name ?? ''} className="input" /></label>
            <label className="field"><span>{t('account.contactName')}</span><input name="contact_name" defaultValue={office.contact_name ?? ''} className="input" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field"><span>{t('account.contactPhone')}</span><input name="contact_phone" type="tel" inputMode="tel" defaultValue={office.contact_phone ?? ''} className="input" /></label>
              <label className="field"><span>{t('account.contactEmail')}</span><input name="contact_email" type="email" defaultValue={office.contact_email ?? ''} className="input" /></label>
            </div>
            <p className="text-sm"><span className="font-medium text-ink">{t('account.territory')}:</span> {office.territory}</p>

            <div className="space-y-1 border-t border-line-soft pt-4">
              <h3>{t('account.payout')}</h3>
              <p className="text-sm">{t('account.payoutHint')}</p>
            </div>
            <label className="field"><span>{t('account.accountName')}</span><input name="account_name" defaultValue={office.payout_details.account_name ?? ''} className="input" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field"><span>{t('account.momoMtn')}</span><input name="momo_mtn" inputMode="tel" defaultValue={office.payout_details.momo_mtn ?? ''} className="input" /></label>
              <label className="field"><span>{t('account.airtel')}</span><input name="airtel" inputMode="tel" defaultValue={office.payout_details.airtel ?? ''} className="input" /></label>
            </div>
            <label className="field"><span>{t('account.bank')}</span><input name="bank" defaultValue={office.payout_details.bank ?? ''} className="input" /></label>
            {isOwner ? <button className="btn-primary w-full">{t('common.save')}</button> : null}
          </fieldset>
        </form>
      </Section>

      <Section title={t('account.team')}>
        <p className="card text-sm">{t('account.teamLocked')}</p>
      </Section>
    </>
  )
}
