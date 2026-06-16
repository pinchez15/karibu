import { notFound } from 'next/navigation'
import { StationDemoClient } from './StationDemoClient'

export default function StationDemoPage() {
  if (process.env.NODE_ENV === 'production' && process.env.E2E_FIXTURE_ENABLED !== '1') {
    notFound()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-6">
      <StationDemoClient />
    </div>
  )
}
