// A fixed 150 KB of incompressible bytes for the readiness form's signal test.
// Small on purpose: clinic data is expensive.
import { randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(new Uint8Array(randomBytes(150_000)), {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Encoding': 'identity' },
  })
}
