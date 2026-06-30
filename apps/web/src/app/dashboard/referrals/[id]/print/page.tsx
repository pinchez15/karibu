import { redirect, notFound } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { getReferralPrintSummary } from '../../actions'
import { ReferralPrintView } from './ReferralPrintView'

export default async function ReferralPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { id } = await params
  const summary = await getReferralPrintSummary(id)
  if (!summary) notFound()

  return <ReferralPrintView summary={summary} />
}
