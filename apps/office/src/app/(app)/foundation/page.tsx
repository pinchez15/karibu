import { Flash, PageHeader, Section } from '@/components/ui'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { t } from '@/i18n'
import { milestoneName } from '@/components/GrantList'
import { evidenceText } from '@/lib/grants'
import { releaseMilestoneAction, resolveConflictAction } from './actions'
import type { Overview } from './types'

type Props = { searchParams: Promise<{ ok?: string; error?: string }> }

const STATUS_CHIP = { pending: 'chip-warning', active: 'chip-success', suspended: 'chip-danger', closed: 'chip-neutral' } as const
const FEE_CHIP = { not_started: 'chip-neutral', current: 'chip-success', due: 'chip-warning', lapsed: 'chip-danger' } as const

export default async function FoundationPage({ searchParams }: Props) {
  const flash = await searchParams
  const [data, ready] = await Promise.all([
    rpc<Overview>('office_admin_overview'),
    rpc<{ id: string; key: string; amount: number; currency: string; office_id: string; office_name: string; evidence: Record<string, unknown> | null }[]>('office_admin_milestones_ready'),
  ])

  return (
    <>
      <PageHeader title={t('foundation.title')} action={<a href="/foundation/offices/new" className="btn-primary shrink-0">{t('foundation.newOffice')}</a>} />
      <Flash {...flash} />

      <Section title={t('grants.ready')}>
        {ready.length === 0 ? <p className="card text-sm">{t('grants.readyEmpty')}</p> : (
          <ul className="space-y-2">
            {ready.map((m) => (
              <li key={m.id} className="card space-y-2">
                <p className="font-semibold text-ink">{m.office_name}: {milestoneName(m.key)} · {money(m.amount, m.currency)}</p>
                <p className="text-sm">{t('grants.evidence')}: {evidenceText(m.evidence)}</p>
                <form action={releaseMilestoneAction} className="flex gap-2">
                  <input type="hidden" name="milestone_id" value={m.id} />
                  <input name="reference" className="input" placeholder={t('grants.releaseRef')} aria-label={t('grants.releaseRef')} autoComplete="off" />
                  <button className="btn-primary shrink-0">{t('grants.release')}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('foundation.conflicts')}>
        {data.conflicts.length === 0 ? (
          <p className="card text-sm">{t('foundation.noConflicts')}</p>
        ) : (
          <ul className="space-y-2">
            {data.conflicts.map((c) => (
              <li key={c.id} className="card space-y-3">
                <p className="text-ink">
                  {t('foundation.conflictLine', {
                    claiming: c.claiming_office ?? '?', holding: c.holding_office ?? '?',
                    name: c.proposed.name ?? '?', district: c.proposed.district ? ` (${c.proposed.district})` : '',
                    stage: c.held_stage ? t(`clinics.stage.${c.held_stage as 'lead'}`) : '?',
                  })}
                </p>
                <form action={resolveConflictAction} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="conflict_id" value={c.id} />
                  <button name="decision" value="deny" className="btn-primary">{t('foundation.deny')}</button>
                  <button name="decision" value="allow" className="btn-secondary">{t('foundation.allow')}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('foundation.offices')}>
        <ul className="space-y-2">
          {data.offices.map((o) => (
            <li key={o.id}>
              <a href={`/foundation/offices/${o.id}`} className="card block space-y-2 active:bg-line-soft">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{o.name}</span>
                  <span className={STATUS_CHIP[o.status]}>{t(`foundation.status.${o.status}`)}</span>
                </span>
                <span className="block text-sm">
                  {o.territory} · {t(`stage.name.${o.stage.stage}`)} · {t('foundation.clinics', { n: o.clinics })} · {o.stage.live_clinics} live
                </span>
                {o.stage.live_clinics > 0 ? <span className="block text-sm">{t('foundation.health', o.health)}</span> : null}
                <span className="flex flex-wrap gap-1.5">
                  <span className={FEE_CHIP[o.fee_status]}>
                    {t('account.fee')}: {t(`account.feeStatus.${o.fee_status}`)}
                    {o.fee_months_due > 0 ? ` · ${t('foundation.feeMonthsDue', { n: o.fee_months_due })}` : ''}
                  </span>
                  <span className={o.certified_at ? 'chip-success' : 'chip-neutral'}>
                    {o.certified_at ? t('account.certification') : t('account.notCertified')}
                  </span>
                  {!o.owner ? <span className="chip-warning">{t('foundation.noOwner')}</span>
                    : !o.owner.joined ? <span className="chip-warning">{t('foundation.ownerPending')}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('foundation.fund')}>
        {data.fund.length === 0 ? (
          <p className="card text-sm">{t('foundation.fundEmpty')}</p>
        ) : (
          <ul className="card divide-y divide-line-soft py-1">
            {data.fund.map((f) => (
              <li key={f.fund} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-mono text-ink">{f.fund}</span>
                <span className="font-semibold text-ink">{money(f.collected, f.currency)} {t('foundation.collected')}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('foundation.escalated')}>
        <a href="/foundation/tickets" className="card block font-semibold text-ink">
          {t('foundation.escalatedOpen', { n: data.escalated_tickets })} →
        </a>
      </Section>
    </>
  )
}
