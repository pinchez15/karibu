import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { visit_id } = await req.json()

    if (!visit_id) {
      return new Response(
        JSON.stringify({ error: 'visit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get audio upload info
    const { data: audioUpload, error: audioError } = await supabase
      .from('audio_uploads')
      .select('*')
      .eq('visit_id', visit_id)
      .single()

    if (audioError || !audioUpload) {
      throw new Error('Audio upload not found')
    }

    if (!audioUpload.storage_path) {
      throw new Error('Audio file path not found')
    }

    // Update status to transcribing
    await supabase
      .from('audio_uploads')
      .update({
        status: 'transcribing',
        transcription_started_at: new Date().toISOString(),
      })
      .eq('id', audioUpload.id)

    // Download audio file from storage
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio-recordings')
      .download(audioUpload.storage_path)

    if (downloadError || !audioData) {
      throw new Error('Failed to download audio file')
    }

    // Call OpenAI Whisper API for transcription
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    const formData = new FormData()
    formData.append('file', audioData, 'recording.m4a')
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')
    formData.append('response_format', 'text')

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    })

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text()
      throw new Error(`Whisper API error: ${errorText}`)
    }

    const transcript = await whisperResponse.text()

    // Update audio upload with completed status
    await supabase
      .from('audio_uploads')
      .update({
        status: 'completed',
        transcription_completed_at: new Date().toISOString(),
      })
      .eq('id', audioUpload.id)

    // Create or update provider note with transcript
    const { error: noteError } = await supabase
      .from('provider_notes')
      .upsert({
        visit_id,
        transcript,
        status: 'draft',
      }, {
        onConflict: 'visit_id',
      })

    if (noteError) {
      throw new Error(`Failed to save transcript: ${noteError.message}`)
    }

    // Trigger note generation
    const generateNotesUrl = `${supabaseUrl}/functions/v1/generate-notes`
    await fetch(generateNotesUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ visit_id }),
    })

    return new Response(
      JSON.stringify({ success: true, transcript_length: transcript.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Transcription error:', error)

    // Try to update status to failed
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { visit_id } = await req.json().catch(() => ({}))
      if (visit_id) {
        await supabase
          .from('audio_uploads')
          .update({
            status: 'failed',
            error_message: error.message,
          })
          .eq('visit_id', visit_id)
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
