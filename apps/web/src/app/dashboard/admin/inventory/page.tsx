import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { InventoryClient, type InventoryItem } from './InventoryClient'

/**
 * Per-clinic inventory: which labs and drugs this clinic actually offers /
 * stocks. Admin-only. Shipped seeded with the HC III standard menu in
 * migration 033; admins can toggle items off if they don't have them, or
 * add custom items they do.
 *
 * The same data drives the AI review function's suggestions (constrains
 * "Suggest only tests on this list, prefix others with 'If available'") —
 * but the page is framed purely as inventory. Staff don't need to know.
 */

async function getInventory(clinicId: string): Promise<{
  labs: InventoryItem[]
  drugs: InventoryItem[]
}> {
  const supabase = createServiceClient()

  const { data: labs } = await supabase
    .from('clinic_lab_capabilities')
    .select('test_name, is_available, notes, updated_at')
    .eq('clinic_id', clinicId)
    .order('test_name')

  const { data: drugs } = await supabase
    .from('clinic_pharmacy_formulary')
    .select('drug_name, in_stock, notes, updated_at')
    .eq('clinic_id', clinicId)
    .order('drug_name')

  return {
    labs: (labs ?? []).map((l) => ({
      name: l.test_name,
      enabled: l.is_available,
      notes: l.notes,
    })),
    drugs: (drugs ?? []).map((d) => ({
      name: d.drug_name,
      enabled: d.in_stock,
      notes: d.notes,
    })),
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
            Defaults seeded from the Uganda Health Centre III service standard. Add custom items
            below each section if you offer something outside the standard list.
          </p>
        </div>

        <InventoryClient labs={labs} drugs={drugs} />
      </div>
    </>
  )
}
