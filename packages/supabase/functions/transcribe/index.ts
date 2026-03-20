import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { withRetry, fetchWithRetry } from '../_shared/retry.ts'
import { createLogger } from '../_shared/logger.ts'
import { transcribe } from '../_shared/transcription/router.ts'
import { translateToEnglish } from '../_shared/transcription/translate.ts'
import { auditLog } from '../_shared/audit.ts'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { checkRateLimit, getRateLimitKey } from '../_shared/rate-limit.ts'

const logger = createLogger('transcribe')

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflightResponse = handleCorsPreflightOrError(req)
  if (preflightResponse) return preflightResponse

  let visit_id: string | undefined

  try {
    const body = await req.json()
    visit_id = body.visit_id

    // Rate limit: 5 transcription requests per visit per 10 minutes
    const rlKey = getRateLimitKey(req, body)
    const rl = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 10 * 60 * 1000 })
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before retrying.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } }
      )
    }

    if (!visit_id) {
      return new Response(
        JSON.stringify({ error: 'visit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const op = logger.startOperation('transcription', { visit_id })

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get visit info (including language toggle)
    const { data: visit, error: visitError } = await withRetry(
      async () => {
        const result = await supabase
          .from('visits')
          .select('id, patient_id, source_language, consent_verified')
          .eq('id', visit_id)
          .single()
        if (result.error) throw new Error(result.error.message)
        return result
      },
      'getVisit',
      { maxRetries: 2 }
    )

    if (!visit) {
      throw new Error('Visit not found')
    }

    // Check consent before processing (DPPA requirement)
    if (!visit.consent_verified) {
      logger.warn('Consent not verified, skipping transcription', { visit_id })
      await supabase
        .from('visits')
        .update({
          status: 'error',
          error_message: 'Consent not verified. Audio cannot be processed without patient consent.',
          error_at: new Date().toISOString(),
        })
        .eq('id', visit_id)
      return new Response(
        JSON.stringify({ error: 'Consent not verified' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sourceLanguage = visit.source_language || 'eng'

    // Get audio upload info
    const { data: audioUpload } = await withRetry(
      async () => {
        const result = await supabase
          .from('audio_uploads')
          .select('*')
          .eq('visit_id', visit_id)
          .single()
        if (result.error) throw new Error(result.error.message)
        return result
      },
      'getAudioUpload',
      { maxRetries: 2 }
    )

    if (!audioUpload) {
      throw new Error('Audio upload not found')
    }

    if (!audioUpload.storage_path) {
      throw new Error('Audio file path not found')
    }

    logger.info('Audio upload found', {
      visit_id,
      storage_path: audioUpload.storage_path,
      source_language: sourceLanguage,
    })

    // Update status to transcribing
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('audio_uploads')
          .update({
            status: 'transcribing',
            transcription_started_at: new Date().toISOString(),
          })
          .eq('id', audioUpload.id)
        if (error) throw new Error(error.message)
      },
      'updateStatusToTranscribing'
    )

    // Download audio file from storage
    const { data: audioData } = await withRetry(
      async () => {
        const result = await supabase.storage
          .from('audio-recordings')
          .download(audioUpload.storage_path)
        if (result.error) throw new Error(result.error.message)
        return result
      },
      'downloadAudioFile'
    )

    if (!audioData) {
      throw new Error('Failed to download audio file')
    }

    logger.info('Audio file downloaded', { visit_id, size_bytes: audioData.size })

    // Route to correct transcription provider based on language toggle
    const transcriptionResult = await transcribe({
      audioFile: audioData,
      language: sourceLanguage,
      filename: audioUpload.storage_path.split('/').pop() || 'recording.m4a',
    })

    logger.info('Transcription completed', {
      visit_id,
      provider: transcriptionResult.provider,
      transcript_length: transcriptionResult.transcript.length,
      audio_trimmed: transcriptionResult.audio_trimmed,
    })

    // For non-English transcripts, translate to English
    let transcriptEnglish = transcriptionResult.transcript
    let transcriptOriginal = transcriptionResult.transcript

    if (sourceLanguage === 'local' && transcriptionResult.transcript.length > 0) {
      logger.info('Translating local language transcript to English', { visit_id })
      try {
        const translationResult = await translateToEnglish(transcriptionResult.transcript)
        transcriptEnglish = translationResult.translated_text
        logger.info('Translation completed', {
          visit_id,
          original_length: transcriptOriginal.length,
          translated_length: transcriptEnglish.length,
        })

        // Audit the translation
        auditLog(supabase, {
          actorType: 'system',
          action: 'translation_completed',
          resourceType: 'visit',
          resourceId: visit_id,
          patientId: visit.patient_id,
          metadata: {
            source_language: sourceLanguage,
            original_length: transcriptOriginal.length,
            translated_length: transcriptEnglish.length,
          },
        })
      } catch (translateError) {
        // Translation failure is non-fatal: keep the original transcript
        logger.error('Translation failed, keeping original transcript', { visit_id }, translateError as Error)
        // Still set English transcript to original so the pipeline can continue
        transcriptEnglish = transcriptOriginal
      }
    }

    // Update audio upload with completed status
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('audio_uploads')
          .update({
            status: 'completed',
            transcription_completed_at: new Date().toISOString(),
          })
          .eq('id', audioUpload.id)
        if (error) throw new Error(error.message)
      },
      'updateStatusToCompleted'
    )

    // Create or update provider note with transcripts
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('provider_notes')
          .upsert({
            visit_id,
            transcript: transcriptEnglish, // Keep backward compat: transcript = English version
            transcript_original: transcriptOriginal,
            transcript_english: transcriptEnglish,
            transcription_provider: transcriptionResult.provider,
            transcription_confidence: transcriptionResult.confidence,
            diarization_output: transcriptionResult.diarization.length > 0
              ? transcriptionResult.diarization
              : null,
            audio_trimmed: transcriptionResult.audio_trimmed,
            status: 'draft',
          }, {
            onConflict: 'visit_id',
          })
        if (error) throw new Error(`Failed to save transcript: ${error.message}`)
      },
      'saveTranscript'
    )

    // Audit the transcription
    auditLog(supabase, {
      actorType: 'system',
      action: 'transcription_completed',
      resourceType: 'visit',
      resourceId: visit_id,
      patientId: visit.patient_id,
      metadata: {
        provider: transcriptionResult.provider,
        source_language: sourceLanguage,
        transcript_length: transcriptEnglish.length,
        audio_trimmed: transcriptionResult.audio_trimmed,
      },
    })

    logger.info('Transcript saved, triggering note generation', { visit_id })

    // Trigger note generation (fire and forget with retry)
    const generateNotesUrl = `${supabaseUrl}/functions/v1/generate-notes`
    fetchWithRetry(
      generateNotesUrl,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ visit_id }),
      },
      'triggerNoteGeneration'
    ).catch((error) => {
      logger.error('Failed to trigger note generation', { visit_id }, error)
    })

    op.success({
      provider: transcriptionResult.provider,
      source_language: sourceLanguage,
      transcript_length: transcriptEnglish.length,
      translated: sourceLanguage === 'local',
    })

    return new Response(
      JSON.stringify({
        success: true,
        provider: transcriptionResult.provider,
        source_language: sourceLanguage,
        transcript_length: transcriptEnglish.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    logger.error('Transcription failed', { visit_id }, error)

    // Try to update status to failed
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      if (visit_id) {
        await supabase
          .from('audio_uploads')
          .update({
            status: 'failed',
            error_message: error.message,
          })
          .eq('visit_id', visit_id)

        // Also update visit status to error
        await supabase
          .from('visits')
          .update({
            status: 'error',
            error_message: `Transcription failed: ${error.message}`,
            error_at: new Date().toISOString(),
          })
          .eq('id', visit_id)
      }
    } catch (updateError) {
      logger.error('Failed to update error status', { visit_id }, updateError)
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
