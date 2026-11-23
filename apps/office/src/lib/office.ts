import 'server-only'

import { cache } from 'react'
import { rpc } from './db'
import type { Home } from './types'

/** Home payload, shared by the shell (stage-gated nav) and the page within one request. */
export const getHome = cache(async (officeId: string): Promise<Home> => {
  return rpc<Home>('office_home', { p_office_id: officeId })
})
