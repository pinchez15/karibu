import type { NextApiRequest, NextApiResponse } from 'next'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'
import { buffer } from 'micro'

// Disable body parsing - we need the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
}

// Create Supabase client with service role
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Clerk webhook event types
interface OrganizationMembershipEvent {
  data: {
    id: string
    organization: {
      id: string
      name: string
      slug: string
    }
    public_user_data: {
      user_id: string
      first_name: string | null
      last_name: string | null
      identifier: string // email
    }
    role: string
  }
  type: 'organizationMembership.created' | 'organizationMembership.deleted' | 'organizationMembership.updated'
}

type WebhookEvent = OrganizationMembershipEvent

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createServiceClient()

  // Get webhook secret from environment
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET is not configured')
    return res.status(500).json({ error: 'Webhook secret not configured' })
  }

  // Get the headers
  const svixId = req.headers['svix-id'] as string
  const svixTimestamp = req.headers['svix-timestamp'] as string
  const svixSignature = req.headers['svix-signature'] as string

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('Missing svix headers')
    return res.status(400).json({ error: 'Missing webhook headers' })
  }

  // Get the raw body
  const body = (await buffer(req)).toString()

  // Verify the webhook signature
  const wh = new Webhook(webhookSecret)
  let event: WebhookEvent

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'organizationMembership.created':
        await handleMembershipCreated(supabase, event)
        break

      case 'organizationMembership.deleted':
        await handleMembershipDeleted(supabase, event)
        break

      case 'organizationMembership.updated':
        await handleMembershipUpdated(supabase, event)
        break

      default:
        console.log(`Unhandled event type: ${(event as { type: string }).type}`)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return res.status(500).json({ error: 'Webhook handler failed' })
  }
}

async function handleMembershipCreated(
  supabase: ReturnType<typeof createServiceClient>,
  event: OrganizationMembershipEvent
) {
  const { organization, public_user_data, role } = event.data
  const clerkUserId = public_user_data.user_id
  const email = public_user_data.identifier
  const displayName = [public_user_data.first_name, public_user_data.last_name]
    .filter(Boolean)
    .join(' ') || email.split('@')[0]

  console.log(`Creating/activating staff for user ${clerkUserId} in org ${organization.id}`)

  // Find the clinic by clerk_organization_id
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id')
    .eq('clerk_organization_id', organization.id)
    .single()

  if (clinicError || !clinic) {
    // Clinic not found - create it from the organization data
    console.log(`Clinic not found for org ${organization.id}, creating...`)

    const { data: newClinic, error: createError } = await supabase
      .from('clinics')
      .insert({
        name: organization.name,
        slug: organization.slug,
        clerk_organization_id: organization.id,
      })
      .select('id')
      .single()

    if (createError) {
      console.error('Failed to create clinic:', createError)
      throw createError
    }

    // Use the newly created clinic
    await upsertStaff(supabase, {
      clerkUserId,
      clinicId: newClinic.id,
      email,
      displayName,
      role: mapClerkRole(role),
    })
  } else {
    // Clinic exists, upsert the staff member
    await upsertStaff(supabase, {
      clerkUserId,
      clinicId: clinic.id,
      email,
      displayName,
      role: mapClerkRole(role),
    })
  }
}

async function handleMembershipDeleted(
  supabase: ReturnType<typeof createServiceClient>,
  event: OrganizationMembershipEvent
) {
  const clerkUserId = event.data.public_user_data.user_id
  const organizationId = event.data.organization.id

  console.log(`Deactivating staff ${clerkUserId} from org ${organizationId}`)

  // Find the clinic
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id')
    .eq('clerk_organization_id', organizationId)
    .single()

  if (!clinic) {
    console.log(`Clinic not found for org ${organizationId}, skipping deactivation`)
    return
  }

  // Soft-delete the staff record (set deactivated_at)
  const { error } = await supabase
    .from('staff')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq('clerk_user_id', clerkUserId)
    .eq('clinic_id', clinic.id)

  if (error) {
    console.error('Failed to deactivate staff:', error)
    throw error
  }
}

async function handleMembershipUpdated(
  supabase: ReturnType<typeof createServiceClient>,
  event: OrganizationMembershipEvent
) {
  const { organization, public_user_data, role } = event.data
  const clerkUserId = public_user_data.user_id

  console.log(`Updating staff ${clerkUserId} in org ${organization.id}`)

  // Find the clinic
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id')
    .eq('clerk_organization_id', organization.id)
    .single()

  if (!clinic) {
    console.log(`Clinic not found for org ${organization.id}, skipping update`)
    return
  }

  // Update staff role if changed
  const { error } = await supabase
    .from('staff')
    .update({ role: mapClerkRole(role) })
    .eq('clerk_user_id', clerkUserId)
    .eq('clinic_id', clinic.id)

  if (error) {
    console.error('Failed to update staff:', error)
    throw error
  }
}

async function upsertStaff(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    clerkUserId: string
    clinicId: string
    email: string
    displayName: string
    role: 'admin' | 'doctor' | 'nurse'
  }
) {
  const { clerkUserId, clinicId, email, displayName, role } = params

  // Check if staff exists (might be reactivating)
  const { data: existing } = await supabase
    .from('staff')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .eq('clinic_id', clinicId)
    .single()

  if (existing) {
    // Reactivate existing staff
    const { error } = await supabase
      .from('staff')
      .update({
        email,
        display_name: displayName,
        role,
        is_active: true,
        deactivated_at: null,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('Failed to reactivate staff:', error)
      throw error
    }
    console.log(`Reactivated staff ${clerkUserId}`)
  } else {
    // Create new staff
    const { error } = await supabase
      .from('staff')
      .insert({
        clerk_user_id: clerkUserId,
        clinic_id: clinicId,
        email,
        display_name: displayName,
        role,
      })

    if (error) {
      console.error('Failed to create staff:', error)
      throw error
    }
    console.log(`Created staff ${clerkUserId}`)
  }
}

function mapClerkRole(clerkRole: string): 'admin' | 'doctor' | 'nurse' {
  // Clerk organization roles: org:admin, org:member, etc.
  switch (clerkRole.toLowerCase()) {
    case 'org:admin':
    case 'admin':
      return 'admin'
    case 'org:nurse':
    case 'nurse':
      return 'nurse'
    case 'org:doctor':
    case 'doctor':
    case 'org:member':
    case 'member':
    default:
      return 'doctor'
  }
}
