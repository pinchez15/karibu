import type { Metadata, Viewport } from 'next'
import { t } from '@/i18n'
import '../globals.css'

// Root layout for pages opened without a login, from a WhatsApp link, usually
// on a clinic's phone and the clinic's data. No sign-in library, no service
// worker, nothing that is not needed to read or fill one page.
export const metadata: Metadata = {
  title: t('app.name'),
  icons: { icon: '/logos/icon-only.svg' },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#D92B4B' }

export const dynamic = 'force-dynamic'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
