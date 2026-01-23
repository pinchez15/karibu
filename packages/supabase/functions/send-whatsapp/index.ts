import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { visit_id, magic_link_token } = await req.json()

    if (!visit_id || !magic_link_token) {
      return new Response(
        JSON.stringify({ error: 'visit_id and magic_link_token are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get visit and patient info
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('*, patient:patients(*), clinic:clinics(name, whatsapp_phone_number)')
      .eq('id', visit_id)
      .single()

    if (visitError || !visit) {
      throw new Error('Visit not found')
    }

    const patientPhone = visit.patient?.whatsapp_number
    if (!patientPhone) {
      throw new Error('Patient phone number not found')
    }

    const clinicName = visit.clinic?.name || 'Karibu Health'
    const webUrl = Deno.env.get('WEB_URL') || 'https://karibu.health'
    const noteUrl = `${webUrl}/note/${magic_link_token}`

    // WhatsApp Cloud API configuration
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!

    // Format phone number for WhatsApp (remove + prefix)
    const formattedPhone = patientPhone.replace('+', '')

    // Send WhatsApp message
    const messagePayload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: 'patient_note_ready',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: clinicName },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: magic_link_token },
            ],
          },
        ],
      },
    }

    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whatsappAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      }
    )

    let whatsappResult
    let messageSent = false

    if (whatsappResponse.ok) {
      whatsappResult = await whatsappResponse.json()
      messageSent = true
    } else {
      // If template message fails, try a simple text message
      // (only works within 24-hour window of patient-initiated conversation)
      console.log('Template failed, trying text message')

      const textPayload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: `Your visit summary from ${clinicName} is ready.\n\nView your summary here:\n${noteUrl}\n\nThis link will expire in 30 days.`,
        },
      }

      const textResponse = await fetch(
        `https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(textPayload),
        }
      )

      if (textResponse.ok) {
        whatsappResult = await textResponse.json()
        messageSent = true
      } else {
        const errorText = await textResponse.text()
        console.error('WhatsApp API error:', errorText)
      }
    }

    // Log message attempt
    await supabase.from('message_logs').insert({
      patient_id: visit.patient_id,
      visit_id,
      direction: 'outbound',
      channel: 'whatsapp',
      message_type: 'patient_note',
      content_summary: 'Visit summary link sent',
      external_id: whatsappResult?.messages?.[0]?.id,
      status: messageSent ? 'sent' : 'failed',
      sent_at: messageSent ? new Date().toISOString() : null,
      error_message: messageSent ? null : 'Failed to send message',
    })

    return new Response(
      JSON.stringify({
        success: messageSent,
        message_id: whatsappResult?.messages?.[0]?.id,
        note_url: noteUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('WhatsApp send error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
