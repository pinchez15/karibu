import { notFound } from 'next/navigation'
import { InpatientPrintFixtureClient } from './InpatientPrintFixtureClient'

export const dynamic = 'force-dynamic'

/**
 * B3/B4 render-test fixture — mirrors e2e/receipt-fixture: synthetic data,
 * no auth, no DB. Lets Playwright assert the print views render every
 * section (and the "not discharged yet" state) without seeding real
 * admissions.
 *
 *   ?variant=discharge        -> B3 discharge summary, fully populated
 *   ?variant=not-discharged   -> B3 blocker state (active admission)
 *   ?variant=chart            -> B4 full chart
 *   ?variant=chart&dense=1    -> B4 full chart with many obs/med rows
 */
export default async function InpatientPrintFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; dense?: string }>
}) {
  if (process.env.NODE_ENV === 'production' && process.env.E2E_FIXTURE_ENABLED !== '1') {
    notFound()
  }

  const params = await searchParams
  const variant = params.variant === 'chart' || params.variant === 'not-discharged' ? params.variant : 'discharge'
  const dense = params.dense === '1'

  return <InpatientPrintFixtureClient variant={variant} dense={dense} />
}
