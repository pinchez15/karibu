// "Needs you today": one ranked list built from three places, so the partner
// does not have to visit Money, Pipeline and Clinics to find out what is waiting.
//   * open to-dos (alerts the nightly job raised, and the partner's own)
//   * payments that arrived and have not been confirmed against an invoice
//   * sales follow-ups whose date has passed
// Order is by what it costs to leave it: a silent clinic, then money, then
// usage drops, sales, onboarding, support, and the partner's own notes.
import type { TFn } from '@/i18n'
import { daysLate } from './portfolio'
import { money } from './money'
import { taskHref, taskTitle } from './tasks'
import type { ClinicAccount, Task } from './types'

export type WorkKind = 'risk' | 'money' | 'watch' | 'sales' | 'onboarding' | 'support' | 'karibu' | 'todo'

export interface WorkItem {
  key: string
  kind: WorkKind
  title: string
  detail: string | null
  href: string | null
  /** Set for to-dos, so the row can be ticked off. */
  taskId: string | null
  /** Who to message about it, when the clinic has a number on file. */
  phone: string | null
  contact: string | null
  overdue: boolean
}

export interface UnconfirmedPayment {
  id: string
  amount: number
  currency: string
  method: 'momo_mtn' | 'airtel' | 'cash' | 'bank'
  suggested_invoice: { number: string; clinic_name: string } | null
}

const ORDER: WorkKind[] = ['risk', 'money', 'watch', 'sales', 'onboarding', 'support', 'karibu', 'todo']

const TASK_KIND: Record<string, WorkKind> = {
  no_sync: 'risk', usage_drop: 'watch', invoice_overdue: 'money', new_lead: 'sales',
  readiness_submitted: 'onboarding', training_incomplete: 'onboarding', new_staff: 'onboarding',
  go_live: 'onboarding', first_patient: 'onboarding', ticket: 'support', claim_deny: 'karibu', claim_allow: 'karibu',
}

export function worklist(input: {
  base: string
  tasks: Task[]
  payments: UnconfirmedPayment[]
  clinics: ClinicAccount[]
  now: number
  t: TFn
}): WorkItem[] {
  const { base, tasks, payments, clinics, now, t } = input
  const byId = new Map(clinics.map((c) => [c.id, c]))
  const items: WorkItem[] = []

  for (const task of tasks) {
    const { title, subtitle } = taskTitle(task, t)
    const clinic = task.clinic_account_id ? byId.get(task.clinic_account_id) : undefined
    items.push({
      key: `task:${task.id}`,
      kind: TASK_KIND[task.kind] ?? 'todo',
      // Lead with the clinic: "Good Shepherd HC III: no activity for 64 hours".
      title: subtitle && task.kind !== 'todo' ? `${subtitle}: ${title.charAt(0).toLowerCase()}${title.slice(1)}` : title,
      detail: task.kind === 'todo' ? subtitle : null,
      href: taskHref(base, task),
      taskId: task.id,
      phone: clinic?.champion_phone ?? clinic?.contact_phone ?? null,
      contact: clinic?.champion_name ?? clinic?.contact_name ?? null,
      overdue: task.due_at ? new Date(task.due_at).getTime() < now : false,
    })
  }

  for (const p of payments) {
    items.push({
      key: `payment:${p.id}`,
      kind: 'money',
      title: t('today.payment', { amount: money(p.amount, p.currency), method: t(`money.methodName.${p.method}`) }),
      detail: p.suggested_invoice
        ? t('today.paymentSuggested', { clinic: p.suggested_invoice.clinic_name, number: p.suggested_invoice.number })
        : t('today.paymentUnmatched'),
      href: `${base}/money`,
      taskId: null, phone: null, contact: null, overdue: false,
    })
  }

  for (const c of clinics) {
    if (!c.next_action_at || !['lead', 'contacted', 'demo', 'readiness', 'configured', 'trained', 'kit_delivered'].includes(c.stage)) continue
    const late = daysLate(c.next_action_at, now)
    if (new Date(c.next_action_at).getTime() >= now) continue
    items.push({
      key: `followup:${c.id}`,
      kind: 'sales',
      title: t('today.followUp', { clinic: c.name }),
      detail: late === 1
        ? t('today.followUpLate1', { action: c.next_action ?? t('today.noStep') })
        : late > 1 ? t('today.followUpLate', { action: c.next_action ?? t('today.noStep'), n: late })
        : t('today.followUpToday', { action: c.next_action ?? t('today.noStep') }),
      href: `${base}/clinics/${c.id}`,
      taskId: null,
      phone: c.contact_phone, contact: c.contact_name,
      // The detail line already says how late it is.
      overdue: false,
    })
  }

  return items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

export function countByKind(items: WorkItem[]): Partial<Record<WorkKind, number>> {
  const out: Partial<Record<WorkKind, number>> = {}
  for (const i of items) out[i.kind] = (out[i.kind] ?? 0) + 1
  return out
}
