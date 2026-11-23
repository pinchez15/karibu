// Features unlock by business stage (spec §4.1). The stage itself is derived
// in the database (office.derive_stage); this file only maps stage -> what the
// shell shows. Nothing is hidden behind a menu: the next unlock is always
// stated on the home screen.
import type { StageInfo } from './types'

export type NavKey = 'today' | 'clinics' | 'support' | 'money' | 'more'

export const NAV: { key: NavKey; href: string; minStage: number }[] = [
  { key: 'today', href: '', minStage: 1 },
  { key: 'clinics', href: '/clinics', minStage: 1 },
  { key: 'support', href: '/support', minStage: 2 },
  { key: 'money', href: '/money', minStage: 3 },
  { key: 'more', href: '/more', minStage: 1 },
]

export function navFor(stage: number) {
  return NAV.filter((item) => stage >= item.minStage)
}

export function unlocked(stage: number, key: NavKey): boolean {
  return stage >= (NAV.find((n) => n.key === key)?.minStage ?? 99)
}

/** i18n key suffix for the "what's next" card: stage.next.<n>. Stage 5 has nothing after it. */
export function nextUnlock(info: StageInfo): 2 | 3 | 4 | 5 | null {
  return info.stage < 5 ? ((info.stage + 1) as 2 | 3 | 4 | 5) : null
}
