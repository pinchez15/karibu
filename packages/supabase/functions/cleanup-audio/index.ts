import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'

const logger = createLogger('cleanup-audio')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const op = logger.startOperation('audio_retention_cleanup')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Find visits with expired retention that still have audio files
    const { data: expiredVisits, error: queryError } = await supabase
      .from('visits')
      .select('id, audio_uploads(id, storage_path)')
      .lt('retention_expires_at', new Date().toISOString())
      .is('audio_deleted_at', null)
      .limit(50)

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`)
    }

    if (!expiredVisits || expiredVisits.length === 0) {
      op.success({ message: 'No expired audio to clean up' })
      return new Response(
        JSON.stringify({ success: true, deleted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Found expired audio recordings', { count: expiredVisits.length })

    let deleted = 0
    let errors = 0

    for (const visit of expiredVisits) {
      try {
        const uploads = (visit as any).audio_uploads || []

        // Delete audio files from storage
        for (const upload of uploads) {
          if (upload.storage_path) {
            const { error: storageError } = await supabase.storage
              .from('audio-recordings')
              .remove([upload.storage_path])

            if (storageError) {
              logger.warn('Failed to delete storage file', {
                visit_id: visit.id,
                storage_path: upload.storage_path,
                error: storageError.message,
              })
            }
          }

          // Mark audio upload as deleted
          await supabase
            .from('audio_uploads')
            .update({ status: 'deleted' })
            .eq('id', upload.id)
        }

        // Mark visit audio as deleted
        await supabase
          .from('visits')
          .update({ audio_deleted_at: new Date().toISOString() })
          .eq('id', visit.id)

        // Audit log
        auditLog(supabase, {
          actorType: 'system',
          action: 'audio_retention_deleted',
          resourceType: 'visit',
          resourceId: visit.id,
          metadata: {
            reason: 'retention_period_expired',
            files_deleted: uploads.length,
          },
        })

        deleted++
      } catch (visitError) {
        logger.error('Failed to clean up visit audio', { visit_id: visit.id }, visitError as Error)
        errors++
      }
    }

    op.success({ deleted, errors })

    return new Response(
      JSON.stringify({ success: true, deleted, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    logger.error('Audio cleanup failed', {}, error as Error)
    op.failure(error as Error)

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
