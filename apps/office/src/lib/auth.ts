import 'server-only'

import { cache } from 'react'
import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { rpc } from './db'
import type { Me, Membership } from './types'

/** Who the signed-in person is to Karibu Office. One RPC per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const { userId } = await auth()
  if (!userId) return null
  return rpc<Me>('office_me')
})

/**
 * The office this request is scoped to. Members get their own office; Karibu
 * central can open any office. This is a convenience for routing only: every
 * office_* RPC checks membership again in the database.
 */
export const getOfficeScope = cache(async (slug: string): Promise<Membership> => {
  const me = await getMe()
  if (!me) redirect('/sign-in')
  const own = me.memberships.find((m) => m.slug === slug)
  if (own) return own
  if (me.is_central) {
    const office = me.all_offices.find((o) => o.slug === slug)
    if (office) return { ...office, member_id: null, role: 'central' }
  }
  notFound()
})

export async function requireCentral(): Promise<Me> {
  const me = await getMe()
  if (!me) redirect('/sign-in')
  if (!me.is_central) notFound()
  return me
}
