import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Karibu Health',
  description: 'AI-native clinical documentation for Uganda',
  icons: {
    icon: '/logos/icon-only.png',
    apple: '/logos/icon-only.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background text-foreground">
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
