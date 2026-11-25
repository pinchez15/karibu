// The office's business stage (spec §4.1) is derived in the database
// (office.derive_stage). It no longer hides anything: every area is always in
// the navigation, and each one explains what it is for before it has data
// (spec §14, 2026-11-24). The stage is shown as progress, with the next step
// spelled out on Today and in the guide.
import type { StageInfo } from './types'

export type NavKey = 'today' | 'clinics' | 'support' | 'money' | 'more'

export const NAV: { key: NavKey; href: string }[] = [
  { key: 'today', href: '' },
  { key: 'clinics', href: '/clinics' },
  { key: 'support', href: '/support' },
  { key: 'money', href: '/money' },
  { key: 'more', href: '/more' },
]

/** i18n key suffix for the "what's next" text: stage.next.<n>. Stage 5 has nothing after it. */
export function nextUnlock(info: StageInfo): 2 | 3 | 4 | 5 | null {
  return info.stage < 5 ? ((info.stage + 1) as 2 | 3 | 4 | 5) : null
}
