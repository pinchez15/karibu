import { ArrowRight, Check } from 'lucide-react'
import { KMark } from './brand'
import { LEARN_DEMO_HREF, LEARN_HREF } from './constants'
import { Btn, Container, Eyebrow, Reveal } from './ui'
import { PhoneLearn } from './visuals'

export function LearnSection() {
  return (
    <section id="learn" className="relative overflow-hidden py-[92px]">
      <div className="pointer-events-none absolute -right-[180px] top-[10%] size-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,77,91,0.07),transparent_62%)]" />

      <Container className="relative">
        <div className="grid items-center gap-14 max-[920px]:grid-cols-1 min-[921px]:grid-cols-2">
          <Reveal className="flex justify-center max-[920px]:order-2 min-[921px]:order-1">
            <PhoneLearn />
          </Reveal>

          <Reveal delay={100} className="max-[920px]:order-1 min-[921px]:order-2">
            <div className="mb-[18px] inline-flex items-center gap-2">
              <KMark size={30} color="rgb(var(--kh-coral))" />
              <span className="font-mono text-xs font-semibold tracking-[0.1em] text-coral-deep">
                KARIBU LEARN
              </span>
              <span className="rounded-full bg-coral-soft px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-coral-deep">
                COMING SOON
              </span>
            </div>
            <h2 className="text-[clamp(30px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
              Practice the real thing — for free.
            </h2>
            <p className="mt-[18px] max-w-[460px] text-[17px] leading-relaxed text-body">
              Karibu Learn is free continuing education inside a faithful copy of the EHR. The full
              case library is coming soon — try a demo case today and sign in later when you want CME
              credit tracked.
            </p>
            <div className="my-[22px] flex flex-col gap-3">
              {[
                'Real cases, written by Ugandan clinicians.',
                'Try a demo case now — no sign-in required to start.',
                'Sign in optional later for CME credit tracking.',
                'The same interface you’ll use in the clinic.',
              ].map((p) => (
                <div key={p} className="flex items-start gap-[11px]">
                  <span className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-coral-soft text-coral-deep">
                    <Check size={13} aria-hidden />
                  </span>
                  <span className="text-[14.5px] leading-snug text-body">{p}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn kind="primary" size="lg" accentClassName="bg-coral" href={LEARN_DEMO_HREF} iconRight={ArrowRight}>
                Try demo case
              </Btn>
              <Btn kind="ghost" size="lg" href={LEARN_HREF} className="border-coral/25 text-coral-deep">
                Coming soon
              </Btn>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

export function MissionBand() {
  const stats = [
    ['Phone-first', 'No computer required to run a clinic'],
    ['Offline-first', 'Care continues when the network drops'],
    ['Minutes', 'To document a full visit by voice'],
    ['One record', 'That follows every patient'],
  ] as const

  return (
    <section id="why" className="relative overflow-hidden bg-cobalt-ink py-24 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(120% 90% at 70% 0%, #000 35%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 90% at 70% 0%, #000 35%, transparent 75%)',
        }}
      />
      <div className="pointer-events-none absolute -top-[200px] left-[30%] size-[700px] rounded-full bg-[radial-gradient(circle,rgba(31,54,199,0.35),transparent_60%)]" />

      <Container className="relative">
        <Reveal className="max-w-[760px]">
          <Eyebrow colorClassName="text-white/55">Built in Uganda</Eyebrow>
          <h2 className="mt-4 text-[clamp(32px,4vw,50px)] font-semibold leading-[1.08] tracking-[-0.03em]">
            Made for Ugandan clinics from the very first step — not adapted to them after the fact.
          </h2>
          <p className="mt-5 max-w-[620px] text-lg leading-relaxed text-white/75">
            Most health software is built elsewhere and shipped here. Karibu started in the clinic:
            on the phones clinicians carry, on the bandwidth they have, at the pace they work. Every
            decision serves the patient in the room.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-14 grid gap-7 max-[920px]:grid-cols-2 min-[921px]:grid-cols-4">
            {stats.map(([a, b]) => (
              <div key={a} className="border-t-2 border-white/20 pt-[18px]">
                <div className="text-[28px] font-semibold tracking-[-0.02em]">{a}</div>
                <div className="mt-1.5 text-sm leading-snug text-white/65">{b}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
