import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'

interface ComingSoonPageProps {
  params: Promise<{ slug: string }>
}

const TITLES: Record<string, { title: string; description: string }> = {
  profitability: {
    title: 'Clinic profitability',
    description:
      'Revenue, fees, payouts, and margin per clinic. Drillable by service line, with month-over-month comparisons.',
  },
  'disease-burden': {
    title: 'Disease burden',
    description:
      'Top diagnoses by month, age band, and clinic. Surfaces seasonal patterns and triggers outbreak alerts when a code exceeds 2× rolling baseline.',
  },
  demographics: {
    title: 'Demographics',
    description:
      'Age, sex, geography, repeat-visit rate. Catchment vs registered population. Useful for HMIS planning and outreach.',
  },
  'care-delivered': {
    title: 'Care delivered',
    description:
      'Care volume by service: visits, prescriptions, lab orders, ANC contacts, vaccinations, referrals, admissions.',
  },
  readmission: {
    title: '30-day readmission',
    description:
      'Patients returning within 30 days for the same complaint. Quality indicator that flags clinical or supply-chain failures.',
  },
  outbreak: {
    title: 'Outbreak watch',
    description:
      'Continuous monitor that fires when any diagnosis exceeds 2× rolling baseline at the clinic, district, or region level. Configurable thresholds and notifications.',
  },
  workbench: {
    title: 'Workbench',
    description:
      'Build your own report. Drag fields onto rows / columns, save the view, schedule a recurring email, share with the team.',
  },
}

/**
 * Stub report destination — keeps the analyst overview tile grid usable
 * before each report is fully built. Data layer + charts ship per the
 * analyst roadmap (separate from this design rollout).
 */
export default async function ComingSoonReportPage({ params }: ComingSoonPageProps) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const { slug } = await params
  const meta = TITLES[slug] || {
    title: 'Report',
    description: 'This report is on the roadmap.',
  }

  return (
    <>
      <WebTopBar
        title={meta.title}
        subtitle="REPORT · COMING SOON"
        actions={
          <Link
            href="/dashboard/admin/reports"
            className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to overview
          </Link>
        }
      />

      <div className="p-8 overflow-auto flex-1">
        <div className="max-w-2xl">
          <div className="kh-meta text-cobalt mb-3">PLANNED</div>
          <h2 className="text-3xl font-semibold tracking-tight mb-3">{meta.title}</h2>
          <p className="text-base text-body leading-relaxed">{meta.description}</p>

          <div className="mt-8 bg-amber-soft border border-amber/30 rounded-xl p-5 flex gap-3">
            <Sparkles className="h-5 w-5 text-amber shrink-0 mt-px" />
            <div>
              <div className="font-semibold text-amber-ink">Not built yet</div>
              <div className="text-sm text-body mt-1">
                The aggregation layer for this report is part of the analyst roadmap. The tile is
                live so the design can iterate on the entry point. Data + charts arrive in a follow-up
                pass.
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="kh-meta mb-2">WHAT YOU'LL SEE WHEN IT SHIPS</div>
            <ul className="text-[13px] text-body space-y-1.5 list-disc pl-5">
              <li>Headline KPIs with month-over-month deltas</li>
              <li>Drillable filters: clinic, age band, sex, period, code</li>
              <li>Saved views per analyst, optional schedule for weekly emails</li>
              <li>CSV / PDF export for diocese reporting</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
