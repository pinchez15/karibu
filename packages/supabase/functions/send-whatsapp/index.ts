import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { withRetry, fetchWithRetry } from '../_shared/retry.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logger = createLogger('send-whatsapp')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let visit_id: string | undefined

  try {
    const body = await req.json()
    visit_id = body.visit_id
    const magic_link_token = body.magic_link_token

    if (!visit_id || !magic_link_token) {
      return new Response(
        JSON.stringify({ error: 'visit_id and magic_link_token are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const op = logger.startOperation('sendWhatsAppMessage', { visit_id })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get visit and patient info
    const { data: visit, error: visitError } = await withRetry(
      async () => {
        const result = await supabase
          .from('visits')
          .select('*, patient:patients(*), clinic:clinics(name, whatsapp_phone_number)')
          .eq('id', visit_id)
          .single()
        if (result.error) throw new Error(result.error.message)
        return result
      },
      'getVisit'
    )

    if (!visit) {
      throw new Error('Visit not found')
    }

    const patientPhone = visit.patient?.whatsapp_number
    if (!patientPhone) {
      throw new Error('Patient phone number not found')
    }

    const clinicName = visit.clinic?.name || 'Karibu Health'
    const webUrl = Deno.env.get('WEB_URL') || 'https://karibu.health'
    const noteUrl = `${webUrl}/note/${magic_link_token}`

    logger.info('Sending WhatsApp message', { visit_id, patient_phone: patientPhone.slice(-4) })

    // WhatsApp Cloud API configuration
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!

    // Format phone number for WhatsApp (remove + prefix)
    const formattedPhone = patientPhone.replace('+', '')

    // Send WhatsApp template message
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

    let whatsappResult: any
    let messageSent = false

    // Try template message first (with retry)
    try {
      const whatsappResponse = await fetchWithRetry(
        `https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messagePayload),
        },
        'sendTemplateMessage'
      )

      if (whatsappResponse.ok) {
        whatsappResult = await whatsappResponse.json()
        messageSent = true
        logger.info('Template message sent successfully', { visit_id, message_id: whatsappResult?.messages?.[0]?.id })
      } else {
        const errorText = await whatsappResponse.text()
        logger.warn('Template message failed, trying text fallback', { visit_id, error: errorText })
      }
    } catch (templateError) {
      logger.warn('Template message failed', { visit_id }, templateError)
    }

    // Fallback to text message if template failed
    if (!messageSent) {
      const textPayload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: `Your visit summary from ${clinicName} is ready.\n\nView your summary here:\n${noteUrl}\n\nThis link will expire in 30 days.`,
        },
      }

      try {
        const textResponse = await fetchWithRetry(
          `https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsappAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(textPayload),
          },
          'sendTextMessage'
        )

        if (textResponse.ok) {
          whatsappResult = await textResponse.json()
          messageSent = true
          logger.info('Text message sent successfully', { visit_id, message_id: whatsappResult?.messages?.[0]?.id })
        } else {
          const errorText = await textResponse.text()
          logger.error('Text message also failed', { visit_id, error: errorText })
        }
      } catch (textError) {
        logger.error('Text message failed', { visit_id }, textError)
      }
    }

    // Log message attempt
    await withRetry(
      async () => {
        const { error } = await supabase.from('message_logs').insert({
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
        if (error) throw new Error(error.message)
      },
      'logMessage'
    )

    if (messageSent) {
      op.success({ message_id: whatsappResult?.messages?.[0]?.id })
    } else {
      op.failure(new Error('Failed to send WhatsApp message'))
    }

    return new Response(
      JSON.stringify({
        success: messageSent,
        message_id: whatsappResult?.messages?.[0]?.id,
        note_url: noteUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    logger.error('WhatsApp send error', { visit_id }, error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
