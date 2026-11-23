import { redirect } from 'next/navigation'
import { GrantList, milestoneName } from '@/components/GrantList'
import { Flash, PageHeader, Section } from '@/components/ui'
import { requireCentral } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { KNOWN_MILESTONES, type Grant } from '@/lib/grants'
import { toMinor } from '@/lib/money'
import { t } from '@/i18n'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

// Module-level so the server actions below call it directly instead of capturing it.
async function finish(path: string, fn: () => Promise<unknown>): Promise<never> {
  await requireCentral()
  let failure: string | null = null
  try { await fn() } catch (e) { failure = errorMessage(e, t) }
  redirect(`${path}?${new URLSearchParams(failure ? { error: failure } : { ok: t('common.saved') })}`)
}

export default async function OfficeGrantsPage({ params, searchParams }: Props) {
  const { id } = await params
  const flash = await searchParams
  const grants = await rpc<Grant[]>('office_admin_grants', { p_office_id: id })
  const path = `/foundation/offices/${id}/grants`

  async function create(form: FormData) {
    'use server'
    const currency = (text(form, 'currency') || 'USD').toUpperCase()
    const amount = (k: string) => toMinor(Number(text(form, k).replace(/[^0-9.]/g, '')) || 0, currency)
    const milestones = KNOWN_MILESTONES.map((key) => ({ key, amount: amount(`amount_${key}`) }))
    if (text(form, 'custom_key')) milestones.push({ key: text(form, 'custom_key') as never, amount: amount('custom_amount') })
    await finish(path, () => rpc('office_admin_grant_create', {
      p_office_id: id, p_currency: currency, p_starts_on: text(form, 'starts_on') || null,
      p_milestones: milestones.filter((m) => m.amount > 0), p_notes: text(form, 'notes') || null,
    }))
  }

  async function release(form: FormData) {
    'use server'
    await finish(path, () => rpc('office_admin_milestone_release', { p_milestone_id: text(form, 'milestone_id'), p_reference: text(form, 'reference') || null }))
  }

  return (
    <>
      <PageHeader title={t('foundation.grants')} back={`/foundation/offices/${id}`} />
      <Flash {...flash} />
      <p className="text-sm">{t('grants.verifiedHow')}</p>

      <GrantList grants={grants} renderAction={(m) => m.status === 'verified' ? (
        <form action={release} className="flex gap-2">
          <input type="hidden" name="milestone_id" value={m.id} />
          <input name="reference" className="input" placeholder={t('grants.releaseRef')} aria-label={t('grants.releaseRef')} autoComplete="off" />
          <button className="btn-primary shrink-0">{t('grants.release')}</button>
        </form>
      ) : null} />

      <Section title={t('grants.create')}>
        <form action={create} className="card space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span>{t('grants.currency')}</span><input name="currency" defaultValue="USD" maxLength={3} className="input uppercase" /></label>
            <label className="field"><span>{t('grants.startsOn')}</span><input name="starts_on" type="date" className="input" /></label>
          </div>
          {KNOWN_MILESTONES.map((key) => (
            <label key={key} className="field"><span>{t('grants.amountFor', { name: milestoneName(key) })}</span>
              <input name={`amount_${key}`} inputMode="decimal" className="input" placeholder="0" /></label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span>{t('grants.customKey')}</span><input name="custom_key" className="input font-mono" /></label>
            <label className="field"><span>{t('invoice.amount')}</span><input name="custom_amount" inputMode="decimal" className="input" /></label>
          </div>
          <p className="text-xs text-muted">{t('grants.unknownKey')}</p>
          <button className="btn-primary w-full">{t('grants.create')}</button>
        </form>
      </Section>
    </>
  )
}
