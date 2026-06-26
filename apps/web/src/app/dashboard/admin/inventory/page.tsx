import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicInventoryDrugs } from '@/lib/clinic-catalog'
import { WebTopBar } from '@/components/web-shell'
import { InventoryClient, type InventoryItem } from './InventoryClient'

/**
 * Per-clinic inventory: which labs and drugs this clinic actually offers.
 * Drugs are sourced from medication_catalog (global) with a per-clinic overlay.
 */

async function getInventory(clinicId: string): Promise<{
  labs: InventoryItem[]
  drugs: InventoryItem[]
}> {
  const supabase = createServiceClient()

  const [{ data: labs }, drugs] = await Promise.all([
    supabase
      .from('clinic_lab_capabilities')
      .select('test_name, is_available, notes, code, category, display_order, active, updated_at')
      .eq('clinic_id', clinicId)
      .order('display_order')
      .order('test_name'),
    getClinicInventoryDrugs(clinicId),
  ])

  return {
    labs: (labs ?? []).map((l) => ({
      name: l.test_name,
      enabled: l.is_available,
      notes: l.notes,
      code: l.code,
      category: l.category,
      display_order: l.display_order ?? 0,
      active: l.active ?? true,
    })),
    drugs,
  }
}

export default async function InventoryPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  const { labs, drugs } = await getInventory(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Inventory"
        subtitle="ADMIN · WHAT YOUR CLINIC OFFERS"
        actions={
          <Link
            href="/dashboard/admin"
            className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Admin
          </Link>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        <div className="max-w-3xl space-y-1.5 mb-6">
          <p className="text-sm text-body leading-relaxed">
            Toggle the labs you can run and the drugs you stock. Clinicians see this on the
            visit-detail screen, and the system uses it to keep suggestions realistic for what
            your clinic actually has on hand.
          </p>
          <p className="text-xs text-muted-foreground">
            Drug list is maintained nationally in the formulary catalog; your clinic toggles
            which items are available here.
          </p>
        </div>

        <InventoryClient labs={labs} drugs={drugs} />
      </div>
    </>
  )
}
