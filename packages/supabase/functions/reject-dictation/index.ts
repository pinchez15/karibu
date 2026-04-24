// reject-dictation: clinician reviewed the AI-structured note and wasn't
// satisfied. Clears the AI output (note_content, structured_data, patient
// summary, flattened diagnosis/meds fields) and sends the visit back to
// 'pending' so the clinician can re-dictate. Keeps the original transcript
// so they can edit it before re-dictating instead of starting from scratch.
//
// Used by both Android (ReviewScreen "Request Changes" button) and web
// (dashboard/review/actions.ts rejectVisit).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { requireAuth, requireStaffForClinic, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'

const logger = createLogger('reject-dictation')

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreflightOrError(req)
  if (preflight) return preflight

  let authCtx
  try {
    authCtx = await requireAuth(req)
  } catch (err) {
    return authErrorResponse(err, corsHeaders)
  }

  let visit_id: string | undefined
  try {
    const body = await req.json()
    visit_id = body.visit_id as string | undefined
    const reason = (body.reason as string | undefined)?.trim() || null

    if (!visit_id) {
      return new Response(
        JSON.stringify({ error: 'visit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: visit, error: visitErr } = await supabase
      .from('visits')
      .select('id, clinic_id, patient_id')
      .eq('id', visit_id)
      .maybeSingle()
    if (visitErr) throw new Error(`Visit lookup failed: ${visitErr.message}`)
    if (!visit) {
      return new Response(
        JSON.stringify({ error: 'Visit not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await requireStaffForClinic(supabase, authCtx, visit.clinic_id)

    const now = new Date().toISOString()

    // Identify the rejecting clinician (Clerk users only — service-role rejects
    // come from server-to-server jobs and don't have a staff identity).
    let rejectedBy: string | null = null
    if (authCtx.type === 'clerk') {
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('clerk_user_id', authCtx.userId)
        .maybeSingle()
      rejectedBy = staff?.id ?? null
    }

    // Clear the AI-generated artifacts. Transcript is kept so the clinician
    // can edit it on the dictation screen instead of speaking it again.
    await Promise.all([
      supabase
        .from('provider_notes')
        .update({ note_content: null, structured_data: null, updated_at: now })
        .eq('visit_id', visit_id),
      supabase
        .from('patient_notes')
        .update({ content: null, updated_at: now })
        .eq('visit_id', visit_id),
    ])

    // Reset the visit to pending so the clinician can re-dictate. Also clear
    // the flattened clinical fields that the print path reads, so we don't
    // leave stale AI output visible in receipts/queues.
    const { error: visitUpdateErr } = await supabase
      .from('visits')
      .update({
        status: 'pending',
        review_status: 'rejected',
        reviewed_by: rejectedBy,
        reviewed_at: now,
        diagnosis: null,
        medications: null,
        tests_ordered: null,
        follow_up_instructions: null,
        updated_at: now,
      })
      .eq('id', visit_id)
      .eq('clinic_id', visit.clinic_id)
    if (visitUpdateErr) throw new Error(`visits update failed: ${visitUpdateErr.message}`)

    auditLog(supabase, {
      actorType: authCtx.type === 'clerk' ? 'staff' : 'system',
      action: 'dictation_rejected',
      resourceType: 'visit',
      resourceId: visit_id,
      patientId: visit.patient_id,
      metadata: reason ? { reason } : {},
    })

    logger.info('Dictation rejected, visit reset to pending', { visit_id })

    return new Response(
      JSON.stringify({ success: true, status: 'pending' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders)
    }
    logger.error('reject-dictation failed', { visit_id }, error as Error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
