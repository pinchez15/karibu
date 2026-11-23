'use server'

import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

const CATEGORIES = ['how_to', 'bug', 'sync', 'printing', 'access', 'billing', 'other']

/**
 * "Get help": raises a support request with the Karibu office that looks after
 * this clinic (or with Karibu directly if no office does). The request carries
 * the staff member and the screen they came from. It never carries a patient
 * or visit: support is about the software, and offices must not see patients.
 */
export async function requestHelpAction(formData: FormData) {
  const staff = await requireStaff()
  const body = String(formData.get('body') ?? '').trim()
  const category = String(formData.get('category') ?? 'other')
  const from = String(formData.get('from') ?? '').slice(0, 120)

  if (body.length < 5) redirect('/dashboard/help?error=1')

  const { error } = await createServiceClient().rpc('office_support_ticket_create', {
    p_body: body,
    p_category: CATEGORIES.includes(category) ? category : 'other',
    // Path only, with ids stripped, so a chart URL cannot identify a patient.
    p_context: { app: 'web', screen: from.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\?.*$/, '') },
    p_staff_id: staff.id,
  })
  redirect(error ? '/dashboard/help?error=1' : '/dashboard/help?sent=1')
}
