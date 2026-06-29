import type { CasePack, LearnCase } from './types'

export const DEMO_CASE_ID = 'fever-headache'
export const DEMO_PACK_PATH = '/learn/packs/core-opd.kpack'

/** Load the public demo case — no auth, no progress persistence. */
export async function loadDemoCase(): Promise<LearnCase> {
  const res = await fetch(DEMO_PACK_PATH, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Demo pack unavailable (${res.status})`)
  const pack = (await res.json()) as CasePack
  const c = pack.cases.find((row) => row.id === DEMO_CASE_ID)
  if (!c) throw new Error('Demo case missing from pack')
  return { ...c, packId: pack.id }
}
