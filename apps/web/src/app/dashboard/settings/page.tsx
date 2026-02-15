import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

async function getClinicName(clinicId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', clinicId)
    .single()
  return data?.name || 'Karibu Health'
}

export default async function SettingsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const clinicName = await getClinicName(staff.clinic_id)

  return (
    <div className="p-4 space-y-6">
      {/* User info */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">Clinician Information</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name:</span>
            <span className="font-medium">{staff.display_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role:</span>
            <span className="font-medium capitalize">{staff.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Clinic:</span>
            <span className="font-medium">{clinicName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span className="font-medium">{staff.email}</span>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">About</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version:</span>
            <span className="font-medium">1.0.0 (MVP)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Build:</span>
            <span className="font-medium">2026.02.10</span>
          </div>
        </div>
      </section>

      {/* Sign out */}
      <SignOutButton redirectUrl="/">
        <Button variant="outline" className="w-full h-12 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </SignOutButton>
    </div>
  )
}
