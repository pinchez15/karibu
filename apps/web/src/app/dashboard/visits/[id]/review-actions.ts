'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

/**
 * Log the clinician's response to an AI review question. Drives the
 * AI-quality admin report — over time we'll see which suggestion types
 * land vs. get dismissed and tune the prompt accordingly. Never used as
 * a discipline signal; the clinician is the authority.
 */
export async function recordReviewResponse(
  suggestionId: string,
  response: 'considered_proceeded' | 'reopened_note' | 'dismissed',
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const supabase = createServiceClient()

  // Confirm the suggestion is in the caller's clinic.
  const { data: suggestion } = await supabase
    .from('ai_review_suggestions')
    .select('id, visit_id, clinic_id')
    .eq('id', suggestionId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (!suggestion) return { success: false, error: 'Suggestion not found' }

  const { error } = await supabase
    .from('ai_review_suggestions')
    .update({
      clinician_response: response,
      responded_at: new Date().toISOString(),
      responded_by: staff.id,
    })
    .eq('id', suggestionId)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dashboard/visits/${suggestion.visit_id}`)
  return { success: true }
}
