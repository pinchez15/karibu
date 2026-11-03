// Karibu pricing + local office registry.
//
// Model (see docs/karibu-local-office-pricing.md):
//   1. One global price book in USD, per facility per month: Core $15,
//      Full $30, Pro $60. No per-user or per-module charges.
//   2. Each country gets a local price book: USD x FX anchor, rounded to a
//      clean local number. Local prices are set deliberately, not floated with
//      live FX. The test suite fails if a local price drifts more than
//      LOCAL_PRICE_TOLERANCE from its USD anchor.
//   3. Local offices sell, set up, train and support facilities in a
//      territory. The office bills the facility and keeps 100% of it:
//      subscription, setup and training. No revenue share with Karibu.

export type EditionId = 'core' | 'full' | 'pro'

export interface Edition {
  id: EditionId
  name: string
  /** List price in USD, per facility, per month. All staff included. */
  usdMonthly: number
  /** Who it is for, one line. */
  audience: string
  /** Registered-patient cap per facility; null = unlimited. */
  patientLimit: number | null
  includes: string[]
}

export const EDITIONS: Record<EditionId, Edition> = {
  core: {
    id: 'core',
    name: 'Karibu Core',
    usdMonthly: 15,
    audience: 'Outpatient clinics that need records, notes and billing.',
    patientLimit: 10_000,
    includes: [
      'Patient records and history',
      'OPD notes with dictation and AI assist',
      'Billing and printed receipts',
      'Clinic reports and your data',
    ],
  },
  full: {
    id: 'full',
    name: 'Karibu Full',
    usdMonthly: 30,
    audience: 'Health centres and clinics running a lab, pharmacy or ward.',
    patientLimit: 10_000,
    includes: [
      'Everything in Core',
      'Lab orders and results',
      'Pharmacy: prescribing, dispensing and stock',
      'Inpatient admissions and ward rounds',
      'HMIS 105 monthly reports',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Karibu Pro',
    usdMonthly: 60,
    audience: 'Busy facilities with large patient registers.',
    patientLimit: null,
    includes: ['Everything in Full', 'Unlimited patients', 'Extra storage'],
  },
}

export const EDITION_IDS: EditionId[] = ['core', 'full', 'pro']

/** Pay for 10 months, get 12. */
export const ANNUAL_MONTHS_CHARGED = 10

/** One-time setup for a standard facility: install, configure, first training day. */
export const SETUP_USD = 40

/** Additional on-site training day, before transport. */
export const EXTRA_TRAINING_DAY_USD = 13

/** A local price may sit this far (as a fraction) from USD x FX before it must be reset. */
export const LOCAL_PRICE_TOLERANCE = 0.15

export type CountryCode = 'UG'

export interface CountryPriceBook {
  country: CountryCode
  countryName: string
  currency: string
  /** FX anchor used to set these prices: local units per 1 USD. */
  fxPerUsd: number
  fxAsOf: string
  monthly: Record<EditionId, number>
  setup: number
  extraTrainingDay: number
}

export const PRICE_BOOKS: Record<CountryCode, CountryPriceBook> = {
  UG: {
    country: 'UG',
    countryName: 'Uganda',
    currency: 'UGX',
    // Mid-market ~4,250–4,345 on 2026-10-31..11-03 (XE 4,279.73 on 11-03).
    fxPerUsd: 4300,
    fxAsOf: '2026-11-03',
    monthly: {
      core: 65_000,
      full: 130_000,
      pro: 260_000,
    },
    setup: 150_000,
    extraTrainingDay: 50_000,
  },
}

export interface LocalOffice {
  slug: string
  /** Public name, e.g. "Karibu Masaka". */
  name: string
  country: CountryCode
  /** The district / region the office covers. */
  territory: string
  lead: {
    name: string
    firstName: string
    title: string
    photo: string
    bio: string
  }
  /** Where "Get in touch" messages go. Not shown on the page. */
  inquiryEmail: string
}

export const LOCAL_OFFICES: LocalOffice[] = [
  {
    slug: 'masaka',
    name: 'Karibu Masaka',
    country: 'UG',
    territory: 'Masaka District',
    lead: {
      name: 'Javis Bbombokka',
      firstName: 'Javis',
      title: 'Lead, Karibu Masaka',
      photo: '/headshots/javis.png',
      bio: 'Javis is a nurse and co-designer of Karibu. Every screen clinicians use today was shaped by Javis’s time on Ugandan clinic floors, and every Masaka clinic is set up, trained and supported by Javis directly.',
    },
    inquiryEmail: 'nate@cappawork.com',
  },
]

export function getLocalOffice(slug: string): LocalOffice | undefined {
  return LOCAL_OFFICES.find((o) => o.slug === slug)
}

export function localMonthly(country: CountryCode, edition: EditionId): number {
  return PRICE_BOOKS[country].monthly[edition]
}

export function localAnnual(country: CountryCode, edition: EditionId): number {
  return localMonthly(country, edition) * ANNUAL_MONTHS_CHARGED
}

/** How far a local price sits from its USD anchor, as a signed fraction. */
export function localPriceDrift(country: CountryCode, edition: EditionId): number {
  const book = PRICE_BOOKS[country]
  const anchor = EDITIONS[edition].usdMonthly * book.fxPerUsd
  return book.monthly[edition] / anchor - 1
}

/** A local office's monthly subscription revenue (it keeps all of it). */
export function officeMonthlyRevenue(
  country: CountryCode,
  facilities: Partial<Record<EditionId, number>>,
): number {
  return EDITION_IDS.reduce(
    (sum, id) => sum + (facilities[id] ?? 0) * localMonthly(country, id),
    0,
  )
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}`
}
