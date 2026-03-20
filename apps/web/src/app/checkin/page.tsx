export const dynamic = 'force-dynamic'

import { getClinicBySlug } from './actions'
import { CheckInClient } from './CheckInClient'

interface CheckInPageProps {
  searchParams: Promise<{ clinic?: string }>
}

export default async function CheckInPage({ searchParams }: CheckInPageProps) {
  const params = await searchParams
  const clinicSlug = params.clinic

  if (!clinicSlug) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Check-In</h1>
          <p className="text-muted-foreground">
            Missing clinic identifier. Please use the check-in link provided by your clinic.
          </p>
        </div>
      </div>
    )
  }

  const clinic = await getClinicBySlug(clinicSlug)

  if (!clinic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Check-In</h1>
          <p className="text-muted-foreground">
            Clinic not found. Please check the link and try again.
          </p>
        </div>
      </div>
    )
  }

  return <CheckInClient clinicSlug={clinicSlug} clinicName={clinic.name} />
}
