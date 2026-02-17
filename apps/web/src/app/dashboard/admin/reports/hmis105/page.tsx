import { getStaff, isAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hmis105Client } from './Hmis105Client'

export default async function Hmis105Page() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/admin/reports">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Reports
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold">HMIS 105 Report</h2>
        <p className="text-muted-foreground mt-1">
          Monthly outpatient department summary with age/sex disaggregation
        </p>
      </div>

      <Hmis105Client />
    </div>
  )
}
