'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import {
  screenEbola,
  type VhfSymptomSlug,
} from '@/lib/outbreak-screening-rules'

export async function recordEbolaScreening(input: {
  visitId: string
  patientId: string
  tempC: number | null
  epidemiologicalContact: boolean
  unexplainedBleeding: boolean
  symptoms: VhfSymptomSlug[]
}): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await requireStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const result = screenEbola({
    tempC: input.tempC,
    epidemiologicalContact: input.epidemiologicalContact,
    unexplainedBleeding: input.unexplainedBleeding,
    symptoms: input.symptoms,
  })

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_record_ebola_screening', {
    p_id: randomUUID(),
    p_patient_id: input.patientId,
    p_visit_id: input.visitId,
    p_temp_c: input.tempC,
    p_epi_contact: input.epidemiologicalContact,
    p_unexplained_bleeding: input.unexplainedBleeding,
    p_symptoms: input.symptoms.join(','),
    p_is_suspect: result.isSuspect,
    p_action_taken: result.isSuspect ? 'screened_suspect' : 'screened_not_suspect',
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dashboard/visits/${input.visitId}`)
  return { success: true }
}
