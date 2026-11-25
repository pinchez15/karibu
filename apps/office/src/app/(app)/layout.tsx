import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { ServiceWorker } from '@/components/ServiceWorker'
import { t } from '@/i18n'
import '../globals.css'

// Root layout for everything behind the partner login. The login-free pages a
// clinic opens (readiness form, invoice) have their own root layout in
// (public)/ so they do not download the sign-in library at all.
export const metadata: Metadata = {
  title: t('app.name'),
  description: t('app.tagline'),
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logos/icon-only.svg', apple: '/logos/icon-only.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#D92B4B' }

// Every page is per-user; nothing here is safe to prerender.
export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen">
          {children}
          <ServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  )
}
