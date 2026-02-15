import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define protected routes
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
]);

// Define public routes that should redirect to dashboard if authenticated
const isPublicRoute = createRouteMatcher([
  '/',
]);

// Routes that should never be intercepted
const isPassthroughRoute = createRouteMatcher([
  '/demo',
]);

export default clerkMiddleware(async (auth, req) => {
  // Let /demo route handle its own logic
  if (isPassthroughRoute(req)) return;

  const { userId } = await auth();

  // If user is authenticated and on home page, redirect to dashboard
  if (userId && isPublicRoute(req)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Protect dashboard routes
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - api/webhooks (webhook endpoints - they use their own auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/webhooks).*)',
  ],
};
