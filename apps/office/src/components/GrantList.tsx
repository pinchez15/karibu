import type { ReactNode } from 'react'
import { evidenceText, KNOWN_MILESTONES, MILESTONE_CHIP, type Grant, type Milestone } from '@/lib/grants'
import { money } from '@/lib/money'
import { t } from '@/i18n'

export function milestoneName(key: string): string {
  return (KNOWN_MILESTONES as readonly string[]).includes(key) ? t(`grants.key.${key as (typeof KNOWN_MILESTONES)[number]}`) : key
}

export function GrantList({ grants, renderAction }: { grants: Grant[]; renderAction?: (m: Milestone, g: Grant) => ReactNode }) {
  if (grants.length === 0) return <p className="card text-sm">{t('grants.none')}</p>
  return (
    <>
      {grants.map((g) => (
        <div key={g.id} className="card space-y-3">
          <p className="font-semibold text-ink">{t('grants.released', { released: money(g.released, g.currency), total: money(g.total, g.currency) })}</p>
          <ul className="divide-y divide-line-soft">
            {g.milestones.map((m) => (
              <li key={m.id} className="space-y-1.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{milestoneName(m.key)}</span>
                    <span className="block text-sm">{money(m.amount, g.currency)}</span>
                  </span>
                  <span className={`shrink-0 ${MILESTONE_CHIP[m.status]}`}>{t(`grants.status.${m.status}`)}</span>
                </div>
                {m.evidence ? <p className="text-xs text-muted">{t('grants.evidence')}: {evidenceText(m.evidence)}</p> : null}
                {m.status === 'pending' && !(KNOWN_MILESTONES as readonly string[]).includes(m.key) ? <p className="text-xs text-amber-ink">{t('grants.unknownKey')}</p> : null}
                {renderAction?.(m, g)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
