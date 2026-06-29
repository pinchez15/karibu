'use client'

import { Layers, Smartphone, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Container, Eyebrow, Reveal } from './ui'

function CountUp({
  to,
  suffix = '',
  prefix = '',
  dur = 1300,
  decimals = 0,
}: {
  to: number
  suffix?: string
  prefix?: string
  dur?: number
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let started = false
    let timer: ReturnType<typeof setInterval> | undefined

    const run = () => {
      const t0 = Date.now()
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / dur)
        const eased = 1 - (1 - p) ** 3
        setVal(to * eased)
        if (p >= 1) {
          if (timer) clearInterval(timer)
          setVal(to)
        }
      }, 40)
    }

    const inView = () => {
      const r = el.getBoundingClientRect()
      return r.top < (window.innerHeight || 800) * 0.86 && r.bottom > 0
    }

    const detach = () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(t1)
    }

    const maybeStart = () => {
      if (!started && inView()) {
        started = true
        run()
        detach()
      }
    }

    const onScroll = () => maybeStart()
    window.addEventListener('scroll', onScroll, { passive: true })
    maybeStart()
    const t1 = setTimeout(maybeStart, 320)

    const failsafe = setTimeout(() => {
      if (!started) {
        started = true
        setVal(to)
      }
      detach()
    }, 2400)

    return () => {
      if (timer) clearInterval(timer)
      detach()
      clearTimeout(failsafe)
    }
  }, [to, dur])

  return (
    <span ref={ref}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  )
}

const NUMERIC_STATS = [
  { to: 5, suffix: '', label: 'departments on one shared record' },
  { to: 0, suffix: '', label: 'computers needed to run a clinic' },
  { to: 1, suffix: '', label: 'continuous record per patient' },
] as const

export function ImpactBand() {
  const pillars = [
    [Smartphone, 'Reach, not hardware', 'Karibu runs on the Android phones clinicians already carry. Adding a clinic costs a login, not a procurement cycle — so every dollar reaches further.'],
    [Layers, 'Continuity becomes outcomes', 'One record follows the patient across every role and every visit. Fewer gaps, fewer repeats, safer care — the difference a funded system is meant to make.'],
    [TrendingUp, 'Every visit becomes data', 'Finalized visits feed HMIS 105 reporting from real clinical data, giving clinics and districts the accountability and public-health signal that paper can’t.'],
  ] as const

  return (
    <section id="impact" className="py-16 sm:py-24">
      <Container>
        <div className="grid items-start gap-14 max-[920px]:grid-cols-1 min-[921px]:grid-cols-[0.95fr_1.05fr]">
          <Reveal>
            <Eyebrow colorClassName="text-slate">Why it matters</Eyebrow>
            <h2 className="mt-3.5 text-[clamp(30px,3.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.03em] text-balance text-ink">
              Software that makes every shilling of care go further.
            </h2>
            <p className="mt-[18px] max-w-[460px] text-[17.5px] leading-relaxed text-pretty text-body">
              Built so the smallest HC II and a busy HC IV run on the same record — and so the people
              funding better care can see it compound.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {NUMERIC_STATS.slice(0, 2).map((s) => (
                <div key={s.label} className="bg-white p-5">
                  <div className="text-[38px] font-semibold leading-none tracking-[-0.03em] text-cobalt">
                    <CountUp to={s.to} suffix={s.suffix} />
                  </div>
                  <div className="mt-2 text-[13px] leading-snug text-body">{s.label}</div>
                </div>
              ))}
              <div className="bg-white p-5">
                <div className="text-[38px] font-semibold leading-none tracking-[-0.03em] text-cobalt">
                  HMIS
                </div>
                <div className="mt-2 text-[13px] leading-snug text-body">
                  Finalized visits feed HMIS 105 reporting
                </div>
              </div>
              <div className="bg-white p-5">
                <div className="text-[38px] font-semibold leading-none tracking-[-0.03em] text-cobalt">
                  <CountUp to={NUMERIC_STATS[2].to} suffix={NUMERIC_STATS[2].suffix} />
                </div>
                <div className="mt-2 text-[13px] leading-snug text-body">{NUMERIC_STATS[2].label}</div>
              </div>
            </div>
          </Reveal>

          <div className="flex flex-col gap-3.5">
            {pillars.map(([Icon, title, desc], i) => (
              <Reveal key={title} delay={i * 90}>
                <div className="flex gap-[18px] rounded-2xl border border-line bg-white p-6 shadow-[0_1px_2px_rgba(11,20,82,0.04)]">
                  <span className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-cobalt-soft text-cobalt">
                    <Icon size={22} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h4>
                    <p className="mt-1.5 text-[14.5px] leading-snug text-body">{desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}
