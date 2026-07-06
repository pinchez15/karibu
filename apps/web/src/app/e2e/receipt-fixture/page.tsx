import { notFound } from 'next/navigation'
import type { PaperWidthMm } from '@/lib/thermal-print'
import { ReceiptFixtureClient } from './ReceiptFixtureClient'

export const dynamic = 'force-dynamic'

export default async function ReceiptFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ width?: string; sections?: string }>
}) {
  if (process.env.NODE_ENV === 'production' && process.env.E2E_FIXTURE_ENABLED !== '1') {
    notFound()
  }

  const params = await searchParams
  const widthInput = parseInt(params.width ?? '58', 10)
  const paperWidthMm: PaperWidthMm = widthInput === 80 ? 80 : 58
  const sections = Math.max(1, Math.min(20, parseInt(params.sections ?? '12', 10)))

  return <ReceiptFixtureClient paperWidthMm={paperWidthMm} sections={sections} />
}
