import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { WebTopBar } from '@/components/web-shell'
import { SetAndroidPasswordForm } from '@/components/account/SetAndroidPasswordForm'
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
    <>
      <WebTopBar title="Account" subtitle="SETTINGS" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-xl">
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="font-medium">Android sign-in password</h2>
          <p className="text-sm text-muted-foreground">
            The Karibu app on your phone uses email and password — not the one-time code from your
            invite email.
          </p>
          <SetAndroidPasswordForm compact />
        </section>

        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="font-medium">Clinician information</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-right">{staff.display_name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize text-right">{staff.role}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Clinic</span>
              <span className="font-medium text-right">{clinicName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-right">{staff.email}</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="font-medium">About</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0 (MVP)</span>
            </div>
          </div>
        </section>

        <SignOutButton redirectUrl="/">
          <Button
            variant="outline"
            className="w-full h-12 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </>
  )
}
