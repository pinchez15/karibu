import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()
  try {
    const { phone_number } = await request.json()

    if (!phone_number) {
      return NextResponse.json(
        { error: 'phone_number is required' },
        { status: 400 }
      )
    }

    // Format phone number
    let formattedPhone = phone_number.replace(/[^\d+]/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+256' + formattedPhone.slice(1)
    }
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+256' + formattedPhone
    }

    // Find patient by phone number
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('whatsapp_number', formattedPhone)
      .single()

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'No patient found with this phone number' },
        { status: 404 }
      )
    }

    // Find most recent finalized visit
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id')
      .eq('patient_id', patient.id)
      .in('status', ['sent', 'completed'])
      .order('visit_date', { ascending: false })
      .limit(1)
      .single()

    if (visitError || !visit) {
      return NextResponse.json(
        { error: 'No recent visits found' },
        { status: 404 }
      )
    }

    // Invalidate existing magic links for this visit
    await supabase
      .from('magic_links')
      .update({ expires_at: new Date().toISOString() })
      .eq('visit_id', visit.id)

    // Generate new magic link (48-hour expiry per DPPA compliance)
    const token = generateToken(32)
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { error: linkError } = await supabase
      .from('magic_links')
      .insert({
        patient_id: patient.id,
        visit_id: visit.id,
        token,
        expires_at: expiresAt,
      })

    if (linkError) {
      throw linkError
    }

    // Trigger WhatsApp message via edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visit_id: visit.id,
          magic_link_token: token,
        }),
      })
    } catch (whatsappError) {
      // Log but don't fail — the link was created, patient can still use it
      console.error('Failed to trigger WhatsApp send:', whatsappError)
    }

    return NextResponse.json({
      success: true,
      message: 'A new link has been sent to your WhatsApp',
    })
  } catch (error) {
    console.error('Request link error:', error)
    return NextResponse.json(
      { error: 'Failed to generate new link' },
      { status: 500 }
    )
  }
}

function generateToken(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}
