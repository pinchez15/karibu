// The partner's job, end to end (spec §1): find clinics, get them live, keep
// them running, get paid, grow. This is the map of what Karibu Office does. It
// is shown in full in the guide and in short on Today, so nothing has to be
// discovered by finishing an earlier step first.
import type { Home } from './types'

export type JobKey = 'find' | 'onboard' | 'live' | 'support' | 'money' | 'team'

export interface Job {
  key: JobKey
  /** Where the work happens. Null = not built yet. */
  href: string | null
  /** Extra things you can start from here: [i18n suffix under guide.action, href]. */
  actions: [string, string][]
  /** A number worth showing next to the job, when there is one. */
  count: number | null
  /** 'now' = has live work in it, 'ready' = open and empty, 'later' = not built yet. */
  state: 'now' | 'ready' | 'later'
}

export function journey(base: string, home: Home): Job[] {
  const job = (key: JobKey, href: string | null, count: number | null, actions: [string, string][] = []): Job => ({
    key, href, actions, count, state: href === null ? 'later' : count ? 'now' : 'ready',
  })
  return [
    job('find', `${base}/pipeline`, home.counts.pipeline, [
      ['addClinic', `${base}/clinics/new`],
      ['importList', `${base}/clinics/import`],
      ['sharePage', `${base}/more/share`],
    ]),
    job('onboard', `${base}/onboarding`, home.counts.onboarding),
    job('live', `${base}/clinics?show=live`, home.counts.live),
    job('support', `${base}/support`, home.open_tickets),
    job('money', `${base}/money`, home.invoices.overdue + home.unmatched_payments, [
      ['newInvoice', `${base}/money/invoices/new`],
      ['recordPayment', `${base}/money#record`],
    ]),
    job('team', null, null),
  ]
}
