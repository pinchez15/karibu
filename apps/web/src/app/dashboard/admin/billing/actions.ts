'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

const UpdateBillingRatesSchema = z.object({
  consultationFeeUgx: z.number().int().min(0),
  pharmacyMarkupPercent: z.number().int().min(0).max(200),
})

export type ClinicBillingRates = {
  consultation_fee_ugx: number
  pharmacy_markup_percent: number
}

export async function getClinicBillingRates(): Promise<ClinicBillingRates | null> {
  const staff = await getStaff()
  if (!staff) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinic_billing_rates')
    .select('consultation_fee_ugx, pharmacy_markup_percent')
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  return {
    consultation_fee_ugx: Number(data?.consultation_fee_ugx ?? 5000),
    pharmacy_markup_percent: Number(data?.pharmacy_markup_percent ?? 10),
  }
}

export async function updateClinicBillingRates(
  input: z.infer<typeof UpdateBillingRatesSchema>,
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = await isAdmin()
  if (!admin) return { success: false, error: 'Admin only' }

  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const parsed = UpdateBillingRatesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid billing rates' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('clinic_billing_rates').upsert(
    {
      clinic_id: staff.clinic_id,
      consultation_fee_ugx: parsed.data.consultationFeeUgx,
      pharmacy_markup_percent: parsed.data.pharmacyMarkupPercent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'clinic_id' },
  )

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin/billing')
  revalidatePath('/dashboard/admin')
  return { success: true }
}
