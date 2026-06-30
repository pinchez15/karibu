import { ArrowRight, Check, GraduationCap, Shield, Smartphone, Wifi } from 'lucide-react'
import { KLockup } from './brand'
import { LEARN_HREF } from './constants'
import { Btn, Container, Eyebrow, Reveal } from './ui'
import { HeroEHR } from './visuals'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-40 -top-[260px] size-[720px] rounded-full bg-[radial-gradient(circle,rgba(31,54,199,0.1),transparent_60%)]" />
      <div className="pointer-events-none absolute -left-[200px] -top-[120px] size-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,77,91,0.06),transparent_62%)]" />

      <Container className="relative pb-16 pt-12 sm:pb-24 sm:pt-[72px]">
        <div className="grid items-center gap-12 max-[920px]:grid-cols-1 min-[921px]:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(11,20,82,0.04)]">
                <span className="rounded-full bg-cobalt-soft px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide text-cobalt">
                  KARIBU HEALTH
                </span>
                <span className="text-[12.5px] font-medium text-body">Two apps. One mission.</span>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <h1 className="landing-heading mt-6 text-[clamp(40px,5vw,64px)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
                A medical record, completely on your phone. Designed by clinicians from the very
                start.
              </h1>
            </Reveal>

            <Reveal delay={130}>
              <p className="mt-[22px] max-w-[520px] text-[clamp(16px,1.4vw,19px)] leading-relaxed text-body">
                An AI-enabled EHR designed to run on Android phones, for use in rural clinics in
                Uganda.
              </p>
            </Reveal>

            <Reveal delay={190}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Btn kind="primary" size="lg" href="#ehr" iconRight={ArrowRight}>
                  Explore Karibu EHR
                </Btn>
                <Btn
                  kind="ghost"
                  size="lg"
                  href={LEARN_HREF}
                  icon={GraduationCap}
                  className="border-coral/25 text-coral-deep"
                >
                  Try Karibu Learn — free
                </Btn>
              </div>
            </Reveal>

            <Reveal delay={250}>
              <div className="mt-[34px] flex flex-wrap gap-[22px]">
                <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-body">
                  <Smartphone size={17} className="text-cobalt" aria-hidden />
                  Runs on any Android
                </span>
                <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-body">
                  <Wifi size={17} className="text-cobalt" aria-hidden />
                  Works offline
                </span>
                <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-body">
                  <Shield size={17} className="text-cobalt" aria-hidden />
                  Aligned to UCG 2023
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={160} className="flex justify-center">
            <HeroEHR />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

export function TrustStrip() {
  const items: [string, string][] = [
    ['Built with', 'Ugandan clinicians'],
    ['Designed for', 'HC II – HC IV'],
    ['Documentation in', 'minutes, not hours'],
    ['Patient data', 'never leaves the record'],
  ]

  return (
    <div className="border-y border-line bg-white">
      <Container>
        <div className="grid gap-6 py-[26px] max-[920px]:grid-cols-2 min-[921px]:grid-cols-4">
          {items.map(([a, b], i) => (
            <div
              key={a}
              className={i > 0 ? 'max-[920px]:border-l-0 min-[921px]:border-l min-[921px]:border-line-soft min-[921px]:pl-6' : ''}
            >
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate">
                {a}
              </div>
              <div className="mt-1 text-base font-semibold tracking-[-0.01em] text-ink">{b}</div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  )
}

type ProductCardProps = {
  accentClass: string
  bgAccentClass: string
  softClass: string
  glowColor: string
  markColor: string
  suffix: string
  badge: string
  tagline: string
  points: string[]
  cta: string
  ctaHref: string
}

function ProductCard({
  accentClass,
  bgAccentClass,
  softClass,
  glowColor,
  markColor,
  suffix,
  badge,
  tagline,
  points,
  cta,
  ctaHref,
}: ProductCardProps) {
  return (
    <div
      className="group relative overflow-hidden rounded-[20px] border border-line bg-white p-[30px] transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px]"
      style={{ ['--card-glow' as string]: glowColor }}
    >
      <div
        className="pointer-events-none absolute -right-[60px] -top-[60px] size-[200px] rounded-full opacity-100"
        style={{ background: `radial-gradient(circle, ${glowColor}, transparent 64%)` }}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <KLockup size={30} markColor={markColor} suffix={suffix} suffixColor={markColor} />
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider ${softClass} ${accentClass}`}
          >
            {badge}
          </span>
        </div>
        <h3 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink">{tagline}</h3>
        <div className="my-[18px] flex flex-col gap-[11px]">
          {points.map((p) => (
            <div key={p} className="flex items-start gap-2.5">
              <span
                className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-md ${softClass} ${accentClass}`}
              >
                <Check size={13} aria-hidden />
              </span>
              <span className="text-[14.5px] leading-snug text-body">{p}</span>
            </div>
          ))}
        </div>
        <Btn kind="primary" accentClassName={bgAccentClass} href={ctaHref} iconRight={ArrowRight}>
          {cta}
        </Btn>
      </div>
    </div>
  )
}

export function ProductSplit() {
  return (
    <section className="py-16 sm:py-[88px]">
      <Container>
        <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
          <Eyebrow>Two apps, one roof</Eyebrow>
          <h2 className="mt-3.5 text-[clamp(30px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
            One umbrella. Two ways in.
          </h2>
          <p className="mt-3.5 text-[17px] leading-relaxed text-body">
            Whether you&apos;re running a clinic or sharpening your judgment, Karibu meets you where
            you are.
          </p>
        </Reveal>

        <div className="grid gap-[22px] max-[920px]:grid-cols-1 min-[921px]:grid-cols-2">
          <Reveal delay={60}>
            <ProductCard
              accentClass="text-cobalt"
              bgAccentClass="bg-cobalt"
              softClass="bg-cobalt-soft text-cobalt"
              glowColor="rgba(31,54,199,0.12)"
              markColor="rgb(var(--kh-cobalt))"
              suffix=".health"
              badge="PER CLINIC"
              tagline="The EHR that keeps up with your clinic."
              points={[
                'Speak after the visit — AI can optionally structure a draft note you review and sign.',
                'Runs on any Android, scales to tablets and laptops.',
                'A continuous patient record, even offline.',
              ]}
              cta="Explore Karibu EHR"
              ctaHref="#ehr"
            />
          </Reveal>
          <Reveal delay={120}>
            <ProductCard
              accentClass="text-coral"
              bgAccentClass="bg-coral"
              softClass="bg-coral-soft text-coral-deep"
              glowColor="rgba(251,77,91,0.12)"
              markColor="rgb(var(--kh-coral))"
              suffix=".learn"
              badge="FREE"
              tagline="Free training that feels like the real thing."
              points={[
                'Work realistic cases inside a faithful copy of the EHR.',
                'Coming soon — try a demo case today while we finish the full library.',
                'Sign in later for CME credit tracking when you are ready.',
              ]}
              cta="Try Karibu Learn"
              ctaHref={LEARN_HREF}
            />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
