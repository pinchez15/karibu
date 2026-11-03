import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LOCAL_OFFICES, getLocalOffice } from '@karibu/shared'
import { LocalOfficePage } from '@/components/landing/local/LocalOfficePage'

type Props = { params: Promise<{ office: string }> }

export function generateStaticParams() {
  return LOCAL_OFFICES.map((o) => ({ office: o.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const office = getLocalOffice((await params).office)
  if (!office) return {}
  return {
    title: `${office.name} — Karibu Health for clinics in ${office.territory}`,
    description: `Karibu clinic software, set up and supported locally by ${office.lead.name}. One price per facility, every staff member included. Get a quote.`,
  }
}

export default async function Page({ params }: Props) {
  const office = getLocalOffice((await params).office)
  if (!office) notFound()
  return <LocalOfficePage office={office} />
}
