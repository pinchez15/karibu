import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { loadTbEpisodeDetail } from '../../actions'
import { TbEpisodeDetailClient } from './TbEpisodeDetailClient'

const CLINICAL = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
])

export default async function TbEpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const { id } = await params
  const episode = await loadTbEpisodeDetail(id)
  if (!episode) notFound()

  return (
    <>
      <WebTopBar
        title="TB case"
        subtitle="UNIT REGISTER"
        actions={
          <Link
            href="/dashboard/hiv-tb"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
            Registry
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <TbEpisodeDetailClient episode={episode} />
      </div>
    </>
  )
}
