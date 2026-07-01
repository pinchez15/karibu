import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { HivTbRegistryClient } from './HivTbRegistryClient'
import { loadHivTbRegistry } from './actions'

const CLINICAL = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
])

export default async function HivTbPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const registry = await loadHivTbRegistry(staff.clinic_id)

  return (
    <>
      <WebTopBar title="HIV / TB" subtitle="PROGRAM REGISTERS" />
      <HivTbRegistryClient {...registry} />
    </>
  )
}
