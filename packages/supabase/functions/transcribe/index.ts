import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { withRetry, fetchWithRetry } from '../_shared/retry.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logger = createLogger('transcribe')

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let visit_id: string | undefined

  try {
    const body = await req.json()
    visit_id = body.visit_id

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

    // Get audio upload info
    const { data: audioUpload, error: audioError } = await withRetry(
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

    logger.info('Audio upload found', { visit_id, storage_path: audioUpload.storage_path })

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
    const { data: audioData, error: downloadError } = await withRetry(
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

    // Call OpenAI Whisper API for transcription
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    const formData = new FormData()
    formData.append('file', audioData, 'recording.m4a')
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')
    formData.append('response_format', 'text')

    const whisperResponse = await fetchWithRetry(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
      },
      'whisperTranscription'
    )

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text()
      throw new Error(`Whisper API error: ${errorText}`)
    }

    const transcript = await whisperResponse.text()
    logger.info('Transcription completed', { visit_id, transcript_length: transcript.length })

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

    // Create or update provider note with transcript
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('provider_notes')
          .upsert({
            visit_id,
            transcript,
            status: 'draft',
          }, {
            onConflict: 'visit_id',
          })
        if (error) throw new Error(`Failed to save transcript: ${error.message}`)
      },
      'saveTranscript'
    )

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

    op.success({ transcript_length: transcript.length })

    return new Response(
      JSON.stringify({ success: true, transcript_length: transcript.length }),
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
