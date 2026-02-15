import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

export async function GET() {
  const demoUserId = process.env.DEMO_CLERK_USER_ID

  if (!demoUserId) {
    return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
  }

  try {
    const clerk = await clerkClient()
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: demoUserId,
      expiresInSeconds: 300,
    })

    // Redirect to Clerk's ticket acceptance URL
    const acceptUrl = `${signInToken.url}`
    return NextResponse.redirect(acceptUrl)
  } catch (error) {
    console.error('Failed to create demo sign-in token:', error)
    return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
  }
}
