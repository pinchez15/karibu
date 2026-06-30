import Image from 'next/image'
import { Container, Eyebrow, Reveal } from './ui'

type FounderProps = {
  name: string
  role: string
  location: string
  bio: string
  src: string
  delay?: number
}

function FounderProfile({ name, role, location, bio, src, delay = 0 }: FounderProps) {
  return (
    <Reveal
      delay={delay}
      className="flex w-full max-w-[320px] flex-col items-center text-center sm:max-w-[340px]"
    >
      <div className="relative mb-6 w-full">
        <div
          className="pointer-events-none absolute -inset-4 rounded-[32px] bg-cobalt/15 blur-xl"
          aria-hidden
        />
        <div className="relative mx-auto overflow-hidden rounded-2xl bg-white p-2.5 shadow-[0_12px_40px_rgba(11,20,82,0.14),0_4px_12px_rgba(11,20,82,0.08)] ring-1 ring-black/[0.06]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
            <Image
              src={src}
              alt={`Portrait of ${name}`}
              fill
              sizes="(max-width: 640px) 85vw, 300px"
              className="object-cover object-top"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{name}</h3>
        <p className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-cobalt">
          {role}
        </p>
        <span className="mt-2.5 inline-flex items-center rounded-full border border-cobalt/30 bg-cobalt-soft px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-cobalt-deep">
          {location}
        </span>
        <p className="mt-4 text-[15px] leading-relaxed text-body">{bio}</p>
      </div>
    </Reveal>
  )
}

export function AboutSection() {
  return (
    <section
      id="about"
      className="relative overflow-hidden border-y border-line bg-page py-16 sm:py-[92px]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(rgba(31,54,199,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -left-[120px] top-[20%] size-[420px] rounded-full bg-[radial-gradient(circle,rgba(31,54,199,0.06),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-[80px] bottom-[10%] size-[360px] rounded-full bg-[radial-gradient(circle,rgba(251,77,91,0.05),transparent_65%)]" />

      <Container className="relative">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <Eyebrow>About</Eyebrow>
          <h2 className="landing-heading mt-4 text-[clamp(30px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
            Built by a nurse and a product developer who share one goal.
          </h2>
          <p className="mt-[18px] text-[17px] leading-relaxed text-body">
            Javis and Nate have worked together to build an EHR designed specifically around the
            workflow and needs of clinics in Uganda — not adapted from software built somewhere else.
          </p>
        </Reveal>

        <div className="mx-auto mt-14 flex max-w-[760px] flex-col items-center gap-12 min-[921px]:max-w-none min-[921px]:flex-row min-[921px]:items-start min-[921px]:justify-center min-[921px]:gap-16">
          <FounderProfile
            name="Javis"
            role="Nurse"
            location="Uganda"
            bio="Javis brings frontline clinical experience from Ugandan health facilities. His day-to-day workflow shaped how Karibu handles visits, documentation, and the pace of real clinic work."
            src="/headshots/javis.png"
          />
          <FounderProfile
            name="Nate"
            role="Product developer"
            location="United States"
            bio="Nate builds software products and partners closely with clinicians on the ground. Together with Javis, he turns clinic realities into tools that fit how teams actually work."
            src="/headshots/nate.png"
            delay={80}
          />
        </div>
      </Container>
    </section>
  )
}
