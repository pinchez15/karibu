import 'server-only'
import { cookies } from 'next/headers'

/** Low data mode (spec §4.4): hides non-essential images. A cookie, so the server can skip sending them. */
export async function isLowData(): Promise<boolean> {
  return (await cookies()).get('ko_lowdata')?.value === '1'
}
