import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { getReferralFormContext } from '../actions'
import { ReferralFormClient } from './ReferralFormClient'

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ visitId?: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { visitId } = await searchParams
  if (!visitId) notFound()

  const context = await getReferralFormContext(visitId)
  if (!context) notFound()

  return (
    <>
      <WebTopBar
        title="Refer to hospital"
        subtitle={context.patientName}
        actions={
          <Link
            href={`/dashboard/visits/${visitId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Visit
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <ReferralFormClient context={context} />
      </div>
    </>
  )
}
