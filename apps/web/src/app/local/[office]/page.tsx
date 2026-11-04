import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LOCAL_OFFICES, PRICE_BOOKS, getLocalOffice } from '@karibu/shared'
import { LocalOfficePage } from '@/components/landing/local/LocalOfficePage'

type Props = { params: Promise<{ office: string }> }

export function generateStaticParams() {
  return LOCAL_OFFICES.map((o) => ({ office: o.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const office = getLocalOffice((await params).office)
  if (!office) return {}
  const countryName = PRICE_BOOKS[office.country].countryName
  const title = `${office.name} for healthcare facilities across ${countryName}`
  const description = `Karibu clinic software for healthcare facilities across ${countryName}, set up and supported by ${office.lead.name}. One price per facility, every staff member included. Get a quote.`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  }
}

export default async function Page({ params }: Props) {
  const office = getLocalOffice((await params).office)
  if (!office) notFound()
  return <LocalOfficePage office={office} />
}
