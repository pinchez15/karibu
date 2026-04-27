// approve-dictation: clinician reviewed the AI-structured note and is happy
// with it. Marks the provider + patient notes as finalized and flips the
// visit to 'sent' / review_status='reviewed' so it can be printed.
//
// Used by Android ReviewScreen "Approve" button. The web has its own
// equivalent in dashboard/review/actions.ts approveVisit() which also
// supports saving an in-place SOAP edit; this edge function is the
// minimal version (approve as-is, no edit).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { requireAuth, requireStaffForClinic, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'

const logger = createLogger('approve-dictation')

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
      .select('id, clinic_id, patient_id, status')
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

    // Only allow approving from the review state. Approving a sent/completed
    // visit is meaningless; approving a pending visit means there's no AI
    // output to approve yet.
    if (visit.status !== 'review') {
      return new Response(
        JSON.stringify({ error: `Cannot approve visit in status '${visit.status}'` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const now = new Date().toISOString()

    let approverId: string | null = null
    if (authCtx.type === 'clerk') {
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('clerk_user_id', authCtx.userId)
        .maybeSingle()
      approverId = staff?.id ?? null
    }

    const [providerErr, patientErr] = await Promise.all([
      supabase
        .from('provider_notes')
        .update({
          status: 'finalized',
          finalized_at: now,
          finalized_by: approverId,
          updated_at: now,
        })
        .eq('visit_id', visit_id)
        .then(r => r.error),
      supabase
        .from('patient_notes')
        .update({ status: 'finalized', updated_at: now })
        .eq('visit_id', visit_id)
        .then(r => r.error),
    ])
    if (providerErr) throw new Error(`provider_notes finalize failed: ${providerErr.message}`)
    if (patientErr) throw new Error(`patient_notes finalize failed: ${patientErr.message}`)

    const { error: visitUpdateErr } = await supabase
      .from('visits')
      .update({
        status: 'sent',
        review_status: 'reviewed',
        reviewed_by: approverId,
        reviewed_at: now,
        finalized_at: now,
        updated_at: now,
      })
      .eq('id', visit_id)
      .eq('clinic_id', visit.clinic_id)
    if (visitUpdateErr) throw new Error(`visits update failed: ${visitUpdateErr.message}`)

    auditLog(supabase, {
      actorType: authCtx.type === 'clerk' ? 'staff' : 'system',
      action: 'dictation_approved',
      resourceType: 'visit',
      resourceId: visit_id,
      patientId: visit.patient_id,
      metadata: {},
    })

    logger.info('Dictation approved, visit moved to sent', { visit_id })

    return new Response(
      JSON.stringify({ success: true, status: 'sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders)
    }
    logger.error('approve-dictation failed', { visit_id }, error as Error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
