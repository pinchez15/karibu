import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PRICE_BOOKS, getLocalOffice, type CountryCode, type LocalOffice } from '@karibu/shared'
import { LocalOfficePage } from '@/components/landing/local/LocalOfficePage'
import { createServiceClient } from '@/lib/supabase'

type Props = { params: Promise<{ office: string }> }

// Offices live in the database (office.offices) so Karibu central can add one
// from the Foundation console without a deploy. The static registry in
// packages/shared is the seed, and the fallback if the database is unreachable.
export const revalidate = 3600

type PublicProfile = { slug: string; name: string; country: string; territory: string; lead: Partial<LocalOffice['lead']> }

async function loadOffice(slug: string): Promise<LocalOffice | null> {
  const seed = getLocalOffice(slug)
  try {
    const { data, error } = await createServiceClient().rpc('office_public_profile', { p_slug: slug })
    const profile = data as PublicProfile | null
    if (error || !profile) return seed ?? null
    if (!PRICE_BOOKS[profile.country as CountryCode] || !profile.lead?.name) return seed ?? null
    return {
      slug: profile.slug,
      name: profile.name,
      country: profile.country as CountryCode,
      territory: profile.territory,
      lead: {
        name: profile.lead.name,
        firstName: profile.lead.firstName ?? profile.lead.name.split(' ')[0],
        title: profile.lead.title ?? `Lead, ${profile.name}`,
        photo: profile.lead.photo ?? seed?.lead.photo ?? '/logos/icon-only.png',
        bio: profile.lead.bio ?? '',
      },
      // Only used if saving the enquiry fails and the form falls back to email.
      inquiryEmail: seed?.inquiryEmail ?? '',
    }
  } catch {
    return seed ?? null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const office = await loadOffice((await params).office)
  if (!office) return {}
  return {
    title: `${office.name} — Karibu Health for clinics in ${office.territory}`,
    description: `Karibu clinic software, set up and supported locally by ${office.lead.name}. One price per facility, every staff member included. Get a quote.`,
  }
}

export default async function Page({ params }: Props) {
  const office = await loadOffice((await params).office)
  if (!office) notFound()
  return <LocalOfficePage office={office} />
}
