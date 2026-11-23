import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Login-free surfaces: the sign-in page, and the token-gated pages a clinic
// opens from WhatsApp (readiness form, invoice). Everything else needs the
// partner login. Database access is still decided by the office_* RPCs.
const isPublic = createRouteMatcher(['/sign-in(.*)', '/r/(.*)', '/i/(.*)', '/offline'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|manifest.webmanifest|sw.js|robots.txt).*)'],
}
