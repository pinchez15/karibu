import type { TFn, Key } from '@/i18n'
import type { Task } from './types'

/** Where a to-do takes you. Every item is one tap from the action (spec §4.2). */
export function taskHref(base: string, task: Task): string | null {
  if (!task.clinic_account_id) {
    if (task.kind === 'invoice_overdue') return `${base}/money`
    return null
  }
  const clinic = `${base}/clinics/${task.clinic_account_id}`
  switch (task.kind) {
    case 'readiness_submitted':
    case 'training_incomplete':
    case 'new_staff':
    case 'go_live':
      return `${clinic}/onboarding`
    case 'invoice_overdue':
      return `${base}/money`
    case 'ticket':
      return `${base}/support`
    default:
      return clinic
  }
}

/** System and alert tasks are stored as a kind + numbers, and worded here so they can be translated. */
export function taskTitle(task: Task, t: TFn): { title: string; subtitle: string | null } {
  if (task.kind === 'todo') return { title: task.title, subtitle: task.clinic_name ?? null }
  const key = `task.${task.kind}` as Key
  const worded = t(key, task.detail as Record<string, string | number>)
  if (worded === key) return { title: task.title, subtitle: task.clinic_name ?? null }
  return { title: worded, subtitle: task.clinic_name ?? task.title ?? null }
}
