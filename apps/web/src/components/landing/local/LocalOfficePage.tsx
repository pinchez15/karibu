'use client'

import Image from 'next/image'
import {
  Check,
  Lock,
  MapPin,
  Pill,
  Smartphone,
  Users,
  WifiOff,
} from 'lucide-react'
import { FormEvent, useState } from 'react'
import {
  ANNUAL_MONTHS_CHARGED,
  EDITIONS,
  PRICE_BOOKS,
  formatMoney,
  type LocalOffice,
  type EditionId,
} from '@karibu/shared'
import { KLockup } from '../brand'
import { CAPPAWORK_HREF } from '../constants'
import { Btn, Container, Eyebrow, Reveal } from '../ui'

const SHOWN: EditionId[] = ['core', 'full', 'pro']

function contactHref(office: LocalOffice, body: string) {
  const subject = encodeURIComponent(`${office.name}: message for ${office.lead.firstName}`)
  return `mailto:${office.inquiryEmail}?subject=${subject}&body=${encodeURIComponent(body)}`
}

export function LocalOfficePage({ office }: { office: LocalOffice }) {
  const book = PRICE_BOOKS[office.country]
  const money = (n: number) => formatMoney(n, book.currency)
  const first = office.lead.firstName

  return (
    <div className="min-h-screen bg-page text-body">
      <header className="sticky top-0 z-50 border-b border-line bg-page/85 backdrop-blur-[14px]">
        <Container className="flex h-[64px] items-center justify-between gap-3">
          <a href="/" className="flex min-w-0 items-center gap-2.5 no-underline">
            <KLockup size={28} textColor="rgb(var(--kh-ink))" />
            <span className="hidden truncate rounded-full border border-cobalt/25 bg-cobalt-soft px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cobalt-deep sm:inline">
              {office.territory}
            </span>
          </a>
          <Btn kind="primary" size="sm" href="#contact">
            Get in touch
          </Btn>
        </Container>
      </header>

      <main>
        {/* Hero */}
        <section className="py-12 sm:py-20">
          <Container className="grid items-center gap-10 min-[921px]:grid-cols-[1.25fr_1fr] min-[921px]:gap-16">
            <Reveal>
              <Eyebrow>{office.name}</Eyebrow>
              <h1 className="landing-heading mt-4 text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
                Clinic software for healthcare facilities across {book.countryName}, set up by someone you can call.
              </h1>
              <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-body">
                Karibu serves healthcare facilities across {book.countryName}. It runs your patient
                records, lab, dispensary and billing on the Android phones your staff already carry,
                with or without internet. {office.lead.name} sets it up at your facility, trains your
                team on site, and stays your first call afterwards.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Btn kind="primary" size="lg" href="#contact">
                  Get in touch with {first}
                </Btn>
              </div>
            </Reveal>

            <Reveal delay={80} className="mx-auto w-full max-w-[340px]">
              <div className="overflow-hidden rounded-2xl border border-line bg-white p-2.5 shadow-[0_18px_48px_rgba(11,20,82,0.12)]">
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
                  <Image
                    src={office.lead.photo}
                    alt={`Portrait of ${office.lead.name}`}
                    fill
                    priority
                    sizes="(max-width: 920px) 85vw, 340px"
                    className="object-cover object-top"
                  />
                </div>
                <div className="px-3 pb-3 pt-4">
                  <div className="text-lg font-semibold tracking-[-0.02em] text-ink">{office.lead.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-cobalt">
                    {office.lead.title}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin size={14} aria-hidden />{' '}
                    {office.territory === book.countryName
                      ? book.countryName
                      : `${office.territory}, ${book.countryName}`}
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-y border-line bg-[rgb(var(--kh-bg))] py-14 sm:py-20">
          <Container>
            <Reveal className="max-w-[680px]">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="landing-heading mt-3.5 text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
                One price per facility. Every staff member included.
              </h2>
              <p className="mt-3.5 text-[16px] leading-relaxed text-body">
                No charge per user and no charge per module. Pay monthly, or pay for{' '}
                {ANNUAL_MONTHS_CHARGED} months and get the year.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4 min-[921px]:grid-cols-3">
              {SHOWN.map((id, i) => {
                const e = EDITIONS[id]
                const featured = id === 'full'
                return (
                  <Reveal key={id} delay={i * 60}>
                    <div
                      className={`flex h-full flex-col rounded-2xl border bg-white p-6 ${
                        featured ? 'border-cobalt shadow-[0_14px_36px_rgba(31,54,199,0.12)]' : 'border-line'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[17px] font-semibold text-ink">{e.name}</h3>
                        {featured && <Tag>Most facilities</Tag>}
                      </div>
                      <p className="mt-1.5 min-h-[42px] text-[13.5px] leading-snug text-muted-foreground">{e.audience}</p>
                      <div className="mt-5">
                        <span className="text-[30px] font-semibold tracking-[-0.03em] text-ink">
                          {money(book.monthly[id])}
                        </span>
                        <span className="text-sm text-muted-foreground"> / month</span>
                      </div>
                      <div className="mt-1 text-[13px] text-body">
                        or {money(book.monthly[id] * ANNUAL_MONTHS_CHARGED)} a year
                      </div>
                      <div className="mt-1 text-[13px] text-muted-foreground">
                        {e.patientLimit === null
                          ? 'Unlimited patients'
                          : `Up to ${e.patientLimit.toLocaleString('en-US')} patients`}
                      </div>
                      <ul className="mt-5 flex flex-col gap-2.5 border-t border-line-soft pt-5">
                        {e.includes.map((item) => (
                          <li key={item} className="flex gap-2 text-[14px] leading-snug text-body">
                            <Check size={16} className="mt-px shrink-0 text-green" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Reveal>
                )
              })}
            </div>

            <Reveal className="mt-4">
              <div className="grid gap-5 rounded-2xl border border-line bg-white p-6 min-[921px]:grid-cols-[1fr_1.4fr] min-[921px]:items-center">
                <div>
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Setup, once
                  </div>
                  <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
                    {money(book.setup)}
                  </div>
                </div>
                <p className="text-[14.5px] leading-relaxed text-body">
                  {first} installs Karibu on your phones, loads your drug and lab price lists, and
                  spends a full training day with your staff at the facility. Extra on-site
                  training days are {money(book.extraTrainingDay)} plus transport. Ongoing support
                  is always free.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2 min-[921px]:grid-cols-4">
              {(
                [
                  [Users, 'Unlimited staff', 'Add every nurse, clinician, lab and dispensary worker at no extra cost.'],
                  [WifiOff, 'Works offline', 'Keep seeing patients when the network drops. It syncs when it returns.'],
                  [Pill, 'Pharmacy included', 'Running a pharmacy with your health centre? It comes with Full, not as a second bill.'],
                  [Lock, 'Records never held back', 'If you stop paying, your patient records stay readable.'],
                ] as const
              ).map(([Icon, title, text]) => (
                <div key={title}>
                  <Icon size={20} className="text-cobalt" aria-hidden />
                  <div className="mt-2.5 text-[15px] font-semibold text-ink">{title}</div>
                  <p className="mt-1 text-[13.5px] leading-snug text-body">{text}</p>
                </div>
              ))}
            </div>

            <p className="mt-10 max-w-[680px] text-[13.5px] leading-relaxed text-muted-foreground">
              For comparison, other clinic systems in {book.countryName} advertise{' '}
              {money(100_000)}–{money(200_000)} a month for a small clinic, and most charge per user.
            </p>
          </Container>
        </section>

        {/* How it works */}
        <section className="py-14 sm:py-20">
          <Container>
            <Reveal className="max-w-[680px]">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="landing-heading mt-3.5 text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
                From first call to first patient in a week.
              </h2>
            </Reveal>
            <ol className="mt-10 grid gap-4 min-[921px]:grid-cols-3">
              {[
                ['Talk to ' + first, `${first} visits your facility, sees how patients move through it, and gives you a written quote.`],
                ['Setup day', `${first} installs Karibu on your phones, loads your prices and stock, and trains your team on real patients.`],
                ['Go live', 'Start seeing patients on Karibu the same day. Pay monthly or yearly by mobile money.'],
              ].map(([title, text], i) => (
                <Reveal key={title} delay={i * 60}>
                  <li className="h-full rounded-2xl border border-line bg-white p-6">
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-cobalt-soft font-mono text-sm font-semibold text-cobalt-deep">
                      {i + 1}
                    </span>
                    <div className="mt-4 text-[16px] font-semibold text-ink">{title}</div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-body">{text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </Container>
        </section>

        {/* About the lead */}
        <section className="border-y border-line bg-[rgb(var(--kh-bg))] py-14 sm:py-20">
          <Container narrow>
            <Reveal className="max-w-[680px]">
              <Eyebrow>Implementation and support</Eyebrow>
              <h2 className="landing-heading mt-3.5 text-[clamp(24px,2.6vw,32px)] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
                {office.lead.name} is your implementation and support contact.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-body">{office.lead.bio}</p>
            </Reveal>
          </Container>
        </section>

        <QuoteSection office={office} />
      </main>

      <footer className="landing-dark bg-cobalt-ink py-10 text-white">
        <Container className="flex flex-wrap items-center justify-between gap-4">
          <KLockup
            size={26}
            markColor="#fff"
            markFg="rgb(var(--kh-cobalt))"
            textColor="#fff"
            suffixColor="rgba(255,255,255,0.6)"
          />
          <div className="text-[13px] text-white/55">
            {office.name} for healthcare facilities across {book.countryName}.{' '}
            <a href={CAPPAWORK_HREF} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:text-white">
              CappaWork
            </a>{' '}
            © {new Date().getFullYear()}
          </div>
        </Container>
      </footer>
    </div>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-cobalt-soft px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-cobalt-deep">
      {children}
    </span>
  )
}

type QuoteFields = {
  facility: string
  type: string
  location: string
  staff: string
  name: string
  phone: string
}

const EMPTY: QuoteFields = { facility: '', type: 'Private clinic', location: '', staff: '', name: '', phone: '' }

const FACILITY_TYPES = ['Private clinic', 'Health centre (HC II–IV)', 'Hospital', 'Other']

function QuoteSection({ office }: { office: LocalOffice }) {
  const [f, setF] = useState<QuoteFields>(EMPTY)
  const [sent, setSent] = useState(false)
  const first = office.lead.firstName

  function submit(e: FormEvent) {
    e.preventDefault()
    const body = [
      `Hello ${first}, I would like to talk about Karibu for my facility.`,
      '',
      `Facility: ${f.facility}`,
      `Type: ${f.type}`,
      `Location: ${f.location}`,
      `Staff: ${f.staff}`,
      `My name: ${f.name}`,
      `Phone: ${f.phone}`,
    ].join('\n')
    window.location.href = contactHref(office, body)
    setSent(true)
  }

  const input =
    'mt-1.5 w-full rounded-[10px] border border-line bg-white px-[13px] py-[11px] text-sm text-ink placeholder:text-muted-foreground/60 outline-none focus:border-cobalt focus:shadow-[0_0_0_4px_rgb(var(--kh-cobalt-soft))]'
  const label = 'font-mono text-[10.5px] font-semibold uppercase tracking-wide text-ink/80'

  return (
    <section id="contact" className="py-14 sm:py-20">
      <Container narrow>
        <div className="grid overflow-hidden rounded-3xl border border-line bg-white shadow-[0_24px_60px_rgba(11,20,82,0.08)] min-[921px]:grid-cols-[1fr_1.1fr]">
          <div className="p-6 sm:p-10">
            <Eyebrow>Get in touch</Eyebrow>
            <h2 className="landing-heading mt-3.5 text-[clamp(24px,2.6vw,32px)] font-semibold leading-[1.12] tracking-[-0.025em] text-ink">
              Get in touch with {first}.
            </h2>
            <p className="mt-3.5 text-[15px] leading-relaxed text-body">
              Tell {first} about your facility. You will hear back within two working days to
              arrange a visit and a quote. There is no cost and no commitment until you agree to one.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 text-[13.5px] text-body">
              <span className="flex items-center gap-2.5">
                <Smartphone size={16} className="text-cobalt" aria-hidden /> Runs on the Android phones you have
              </span>
              <span className="flex items-center gap-2.5">
                <MapPin size={16} className="text-cobalt" aria-hidden /> Serving healthcare facilities across{' '}
                {PRICE_BOOKS[office.country].countryName}
              </span>
            </div>
          </div>

          <div className="border-t border-line bg-[rgb(var(--kh-bg))] p-6 sm:p-10 min-[921px]:border-l min-[921px]:border-t-0">
            {sent ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <span className="mb-4 inline-flex size-[58px] items-center justify-center rounded-full bg-green-soft text-green">
                  <Check size={26} aria-hidden />
                </span>
                <h3 className="landing-heading text-xl font-semibold text-ink">Almost there</h3>
                <p className="mt-1.5 max-w-[260px] text-sm leading-snug text-body">
                  Send the email that just opened and {first} will be in touch.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <label className="block">
                  <span className={label}>Facility name</span>
                  <input required className={input} value={f.facility} onChange={(e) => setF({ ...f, facility: e.target.value })} />
                </label>
                <label className="block">
                  <span className={label}>Type of facility</span>
                  <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                    {FACILITY_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={label}>Town or sub-county</span>
                    <input required className={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className={label}>Number of staff</span>
                    <input inputMode="numeric" className={input} value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={label}>Your name</span>
                    <input required className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className={label}>Phone</span>
                    <input required type="tel" placeholder="+256 7…" className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                  </label>
                </div>
                <Btn kind="primary" size="lg" type="submit" className="mt-3 w-full">
                  Get in touch with {first}
                </Btn>
              </form>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
