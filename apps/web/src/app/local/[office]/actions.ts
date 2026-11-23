'use server'

import { createServiceClient } from '@/lib/supabase'

export interface LeadFields {
  facility: string
  type: string
  location: string
  staff: string
  name: string
  phone: string
  /** Honeypot: real people never see or fill this field. */
  website?: string
}

const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Public "Get in touch" form on /local/[office]. Writes a lead into that
 * office's pipeline in Karibu Office (office_capture_lead, service role only)
 * and puts a to-do on the partner's home screen. Returns only whether it
 * worked: the public never learns anything about the pipeline.
 */
export async function captureLeadAction(officeSlug: string, fields: LeadFields): Promise<{ ok: boolean }> {
  if (fields.website) return { ok: true } // a bot filled the hidden field; pretend it worked
  const name = clip(fields.facility, 120)
  const phone = clip(fields.phone, 30)
  if (name.length < 2 || phone.replace(/\D/g, '').length < 9) return { ok: false }

  const { error } = await createServiceClient().rpc('office_capture_lead', {
    p_office_slug: clip(officeSlug, 40),
    p_fields: {
      name,
      district: clip(fields.location, 80),
      facility_level: clip(fields.type, 40),
      contact_name: clip(fields.name, 80),
      contact_phone: phone,
      staff_count: clip(fields.staff, 4),
    },
  })
  return { ok: !error }
}
