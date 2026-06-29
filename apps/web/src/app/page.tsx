import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: 'Karibu Health — Clinical software for Uganda',
  description:
    'Karibu EHR runs your clinic. Karibu Learn trains the people in it. Mobile-first, offline-capable healthcare software built for Uganda.',
}

export default function Home() {
  return <LandingPage />
}
