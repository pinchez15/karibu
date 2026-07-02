'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicPrintSettings } from '@/lib/clinic-print-settings'

const UpdatePrintSettingsSchema = z.object({
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  cutFeedMm: z.number().int().min(8).max(24),
  autoPrint: z.boolean(),
  markSetupComplete: z.boolean().optional(),
})

export async function getClinicPrintSettingsForStaff() {
  const staff = await getStaff()
  if (!staff) return null
  return getClinicPrintSettings(staff.clinic_id)
}

export async function updateClinicPrintSettings(
  input: z.infer<typeof UpdatePrintSettingsSchema>,
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const parsed = UpdatePrintSettingsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid printer settings' }

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    clinic_id: staff.clinic_id,
    paper_width_mm: parsed.data.paperWidthMm,
    cut_feed_mm: parsed.data.cutFeedMm,
    auto_print: parsed.data.autoPrint,
    updated_at: now,
  }
  if (parsed.data.markSetupComplete) {
    row.setup_completed_at = now
  }

  const { error } = await supabase.from('clinic_print_settings').upsert(row, {
    onConflict: 'clinic_id',
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/settings/printer')
  revalidatePath('/dashboard/settings/printer/test')
  return { success: true }
}

export async function getClinicLetterheadForTest(): Promise<{
  name: string
  phone: string | null
} | null> {
  const staff = await getStaff()
  if (!staff) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinics')
    .select('name, phone')
    .eq('id', staff.clinic_id)
    .maybeSingle()

  if (!data) {
    return { name: 'Karibu Health', phone: null }
  }
  return {
    name: (data.name as string) || 'Karibu Health',
    phone: (data.phone as string | null) ?? null,
  }
}
