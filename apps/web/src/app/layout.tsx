import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

// Karibu type system. Inter for everything; Geist Mono for IDs / timestamps / vitals values.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Karibu Health',
  description: 'AI-native clinical documentation for Uganda',
  icons: {
    icon: '/logos/icon-only.svg',
    apple: '/logos/icon-only.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Skip static prerender for every route. Two reasons:
//   1. CI builds use placeholder Clerk keys, and ClerkProvider in this
//      layout fails its publishableKey format check during prerender of
//      /_not-found. Marking the root layout dynamic skips that path.
//   2. This is an authenticated EMR — almost every page reads
//      auth()/Clerk session anyway, so static prerender wasn't buying us
//      anything. Vercel still does a real production build at deploy
//      time using real env vars.
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
        <body className="min-h-screen bg-background text-foreground">
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
