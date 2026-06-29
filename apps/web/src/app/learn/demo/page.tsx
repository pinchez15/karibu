import type { Metadata } from 'next'
import { LearnDemoApp } from '../components/LearnDemoApp'

export const metadata: Metadata = {
  title: 'Karibu Learn — demo case',
  description: 'Try a sample clinical case inside a faithful copy of the Karibu EHR chart. Generated patient only.',
}

export default function LearnDemoPage() {
  return <LearnDemoApp />
}
