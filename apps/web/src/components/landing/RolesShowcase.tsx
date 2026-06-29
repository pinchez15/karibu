'use client'

import {
  ArrowUpRight,
  Bed,
  Box,
  Check,
  FlaskConical,
  Heart,
  Pill,
  Receipt,
  Smartphone,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Container, Eyebrow, Reveal } from './ui'

const TONE = {
  cobalt: 'rgb(var(--kh-cobalt))',
  slate: 'rgb(var(--kh-slate))',
  green: 'rgb(var(--kh-green))',
  cobaltDeep: 'rgb(var(--kh-cobalt-deep))',
} as const

type ToneKey = keyof typeof TONE

function Chip({
  softClass,
  textClass,
  icon: Icon,
  children,
}: {
  softClass: string
  textClass: string
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${softClass} ${textClass}`}
    >
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  )
}

function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 ${last ? '' : 'border-b border-line-soft'}`}
    >
      {children}
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="size-[7px] shrink-0 rounded-full" style={{ background: color }} />
}

function Surface({
  tone,
  icon: Icon,
  label,
  title,
  children,
  foot,
}: {
  tone: string
  icon: LucideIcon
  label: string
  title: string
  children: ReactNode
  foot?: ReactNode
}) {
  return (
    <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,20,82,0.05),0_24px_60px_rgba(11,20,82,0.1)]">
      <div className="flex items-center gap-2 border-b border-line-soft bg-[rgb(var(--kh-bg))] px-4 py-[11px]">
        <span
          className="inline-flex size-[26px] items-center justify-center rounded-[7px]"
          style={{ background: `${tone}16`, color: tone }}
        >
          <Icon size={15} aria-hidden />
        </span>
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted">
          {label}
        </span>
      </div>
      <div className="p-4">{children}</div>
      {foot && (
        <div className="flex items-center gap-2 border-t border-line-soft bg-[rgb(var(--kh-bg))] px-4 py-[11px]">
          {foot}
        </div>
      )}
    </div>
  )
}

function ClinicianPanel() {
  return (
    <Surface
      tone={TONE.cobalt}
      icon={Stethoscope}
      label="Clinician · Android"
      title="Nakato Sarah · 34F"
      foot={
        <>
          <Chip softClass="bg-cobalt-soft" textClass="text-cobalt" icon={Sparkles}>
            Draft note
          </Chip>
          <span className="ml-auto font-mono text-[10.5px] text-muted">VISIT 09:42 · PT-100015</span>
        </>
      }
    >
      <div className="mb-2 font-mono text-[10px] font-bold tracking-wider text-muted">ASSESSMENT</div>
      <div className="text-[14.5px] font-medium leading-snug text-ink">
        Uncomplicated malaria{' '}
        <span className="font-mono text-xs font-normal text-muted">· B54</span>
      </div>
      <div className="mt-3.5 flex gap-2">
        {[
          [FlaskConical, 'Order lab', TONE.slate],
          [Pill, 'Prescribe', TONE.green],
          [ArrowUpRight, 'Refer', TONE.cobalt],
        ].map(([Icon, label, color]) => (
          <div
            key={label as string}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-[11px] border border-line bg-white py-3"
          >
            <Icon size={18} style={{ color: color as string }} aria-hidden />
            <span className="text-xs font-semibold text-body">{label as string}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-amber/20 bg-amber-soft/50 px-[11px] py-2">
        <Sparkles size={14} className="text-amber" aria-hidden />
        <span className="text-[12.5px] leading-snug text-amber-ink">
          AI suggested code <strong>B54</strong> for you to confirm.
        </span>
      </div>
    </Surface>
  )
}

function LabPanel() {
  const rows = [
    ['Malaria RDT', 'Nakato S.', 'Ready', TONE.green, 'POSITIVE'],
    ['Blood sugar', 'Okello J.', 'Running', 'rgb(var(--kh-amber))', '—'],
    ['Urinalysis', 'Auma B.', 'Received', TONE.slate, '—'],
  ] as const

  return (
    <Surface
      tone={TONE.slate}
      icon={FlaskConical}
      label="Lab · Workflow tool"
      title="Lab worklist"
      foot={
        <>
          <Chip softClass="bg-cobalt-soft" textClass="text-cobalt" icon={Smartphone}>
            Ordered from the clinician&apos;s app
          </Chip>
          <Chip softClass="bg-green-soft" textClass="text-green" icon={Check}>
            Result → phone
          </Chip>
        </>
      }
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold tracking-wider text-muted">
          SPECIMENS TODAY
        </span>
        <span className="font-mono text-[10.5px] text-muted">3 IN QUEUE</span>
      </div>
      {rows.map(([test, pt, st, c, res], i) => (
        <Row key={test} last={i === rows.length - 1}>
          <Dot color={c} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink">{test}</div>
            <div className="font-mono text-[10.5px] text-muted">{pt}</div>
          </div>
          {res !== '—' && (
            <span className="font-mono text-[11px] font-semibold text-red">{res}</span>
          )}
          <span
            className="min-w-16 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold"
            style={{ color: c, background: `${c}16` }}
          >
            {st}
          </span>
        </Row>
      ))}
    </Surface>
  )
}

function PharmacyPanel() {
  const rows = [
    ['Artemether-Lumefantrine', '24 tabs', 'Dispensed', TONE.green],
    ['Paracetamol 500mg', '20 tabs', 'To dispense', TONE.slate],
    ['ORS sachets', '6', 'To dispense', TONE.slate],
  ] as const

  return (
    <Surface
      tone={TONE.green}
      icon={Pill}
      label="Pharmacy · Dispensary"
      title="Scripts received"
      foot={
        <>
          <Chip softClass="bg-cobalt-soft" textClass="text-cobalt" icon={Smartphone}>
            Orders arrive when submitted
          </Chip>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-body">
            <Box size={13} className="text-green" aria-hidden />
            Stock: <strong className="text-ink">AL · 138 left</strong>
          </span>
        </>
      }
    >
      {rows.map(([drug, qty, st, c], i) => (
        <Row key={drug} last={i === rows.length - 1}>
          <span
            className="flex size-[22px] shrink-0 items-center justify-center rounded-md"
            style={{ background: `${c}16`, color: c }}
          >
            {st === 'Dispensed' ? (
              <Check size={13} aria-hidden />
            ) : (
              <Pill size={13} aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">{drug}</div>
            <div className="font-mono text-[10.5px] text-muted">{qty}</div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: c, background: `${c}16` }}
          >
            {st}
          </span>
        </Row>
      ))}
    </Surface>
  )
}

function BillingPanel() {
  const items = [
    ['Consultation', '5,000'],
    ['Malaria RDT', '4,000'],
    ['Artemether-Lumefantrine', '8,000'],
  ] as const

  return (
    <Surface
      tone={TONE.cobaltDeep}
      icon={Receipt}
      label="Billing · Charges"
      title="Visit charges"
      foot={
        <>
          <Chip softClass="bg-green-soft" textClass="text-green" icon={Check}>
            Receipt issued
          </Chip>
          <span className="ml-auto font-mono text-[10.5px] text-muted">UGX · NAKATO S.</span>
        </>
      }
    >
      {items.map(([t, amt]) => (
        <Row key={t}>
          <div className="flex-1 text-[13.5px] text-body">{t}</div>
          <div className="font-mono text-[13px] font-semibold text-ink">{amt}</div>
        </Row>
      ))}
      <div className="flex items-center px-0 py-3 pb-1">
        <div className="flex-1 text-[13px] font-bold text-ink">Total</div>
        <div className="font-mono text-base font-bold text-cobalt">UGX 17,000</div>
      </div>
      <div className="mt-2.5 rounded-[11px] border border-line bg-[rgb(var(--kh-bg))] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold tracking-wide text-muted">
            CLINIC · THIS WEEK
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green">
            <TrendingUp size={12} aria-hidden />
            tracked daily
          </span>
        </div>
        <div className="flex h-[34px] items-end gap-1">
          {[40, 62, 48, 78, 70, 92, 58].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${i === 5 ? 'bg-cobalt' : 'bg-cobalt-soft'}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </Surface>
  )
}

function MaternityPanel() {
  return (
    <Surface
      tone={TONE.green}
      icon={Heart}
      label="Maternity · Ward board"
      title="Inpatient & delivery"
      foot={
        <>
          <Chip softClass="bg-green-soft" textClass="text-green" icon={Users}>
            2 mothers admitted
          </Chip>
          <span className="ml-auto font-mono text-[10.5px] text-muted">OVERNIGHT CARE</span>
        </>
      }
    >
      <div className="mb-2.5 rounded-xl border border-green/20 bg-green-soft/40 p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-[30px] items-center justify-center rounded-lg bg-white text-green">
            <Heart size={16} aria-hidden />
          </span>
          <div className="flex-1">
            <div className="text-[13.5px] font-bold text-ink">
              Bed 1 · Akello Mary{' '}
              <span className="font-mono text-[11px] font-normal text-muted">28F</span>
            </div>
            <div className="text-xs font-semibold text-green">In active labour · 6 cm</div>
          </div>
          <span className="text-right font-mono text-[11px] text-muted">
            FHR 142
            <br />
            <span className="text-[9.5px]">NEXT ROUND 0:18</span>
          </span>
        </div>
        <div className="mt-2.5 flex h-[22px] items-end gap-[3px]">
          {[30, 38, 44, 50, 62, 70, 84, 92].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-green"
              style={{ height: `${h}%`, opacity: 0.35 + i * 0.08 }}
            />
          ))}
        </div>
      </div>
      <Row last>
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-line bg-[rgb(var(--kh-bg))] text-slate">
          <Bed size={16} aria-hidden />
        </span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ink">
            Bed 2 · Nansubuga R.{' '}
            <span className="font-mono text-[11px] font-normal text-muted">post-partum</span>
          </div>
          <div className="text-[11.5px] text-muted">Overnight obs · stable · vitals q4h</div>
        </div>
        <Dot color={TONE.green} />
      </Row>
    </Surface>
  )
}

const ROLES = [
  {
    id: 'clinician',
    label: 'Clinician',
    icon: Stethoscope,
    tone: TONE.cobalt,
    headline: 'Sees the patient and starts the record.',
    body: 'Document by voice, order tests, prescribe, refer — all from the phone in your pocket.',
    Panel: ClinicianPanel,
  },
  {
    id: 'lab',
    label: 'Lab',
    icon: FlaskConical,
    tone: TONE.slate,
    headline: 'Orders flow straight to the lab.',
    body: 'The lab works its own queue and sends results back to the clinician’s phone — no paper chits, no walking between rooms.',
    Panel: LabPanel,
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    icon: Pill,
    tone: TONE.green,
    headline: 'Scripts arrive when orders are submitted.',
    body: 'Pharmacy sees prescriptions the moment they’re submitted — even before the visit note is signed. Mark what’s dispensed and track stock as it moves.',
    Panel: PharmacyPanel,
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: Receipt,
    tone: TONE.cobaltDeep,
    headline: 'Charges and costs, captured as you go.',
    body: 'Issue charges against the visit, print a receipt, and watch the clinic’s numbers build — no end-of-day reconciliation.',
    Panel: BillingPanel,
  },
  {
    id: 'maternity',
    label: 'Maternity',
    icon: Heart,
    tone: TONE.green,
    headline: 'Care that stays through the night.',
    body: 'Admit mothers for delivery or overnight observation, track labour and rounds, and keep it all on the same record.',
    Panel: MaternityPanel,
  },
] as const

export function RolesShowcase() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (paused || !inView) return
    const t = setTimeout(() => setActive((a) => (a + 1) % ROLES.length), 4200)
    return () => clearTimeout(t)
  }, [active, paused, inView])

  const role = ROLES[active]

  return (
    <section
      id="platform"
      className="border-y border-line bg-page py-24"
    >
      <Container>
        <Reveal className="mb-10 max-w-[680px]">
          <Eyebrow colorClassName="text-cobalt">The whole clinic</Eyebrow>
          <h2 className="mt-3.5 text-[clamp(32px,3.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.03em] text-balance text-ink">
            One clinic. One record. Every role.
          </h2>
          <p className="mt-[18px] text-lg leading-relaxed text-pretty text-body">
            A visit doesn&apos;t end with the clinician. In Karibu, the same patient record moves
            with the work — to the lab, the pharmacy, billing, and the maternity ward — so nothing
            is re-entered and nothing falls through.
          </p>
        </Reveal>

        <div
          ref={wrapRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative mb-[34px]">
            <div className="absolute left-[8%] right-[8%] top-[27px] h-0.5 bg-line" />
            <div
              className="absolute left-[8%] right-[8%] top-[26px] h-1 overflow-hidden rounded-full transition-opacity"
              style={{ opacity: inView ? 1 : 0 }}
            >
              <div
                className="kh-flow-comet absolute left-0 top-0 h-full w-[34%]"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgb(var(--kh-cobalt)), transparent)',
                }}
              />
            </div>
            <div className="relative flex justify-between">
              {ROLES.map((r, i) => {
                const on = i === active
                const Icon = r.icon
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActive(i)}
                    className="flex flex-1 cursor-pointer flex-col items-center gap-2.5 border-0 bg-transparent p-0"
                  >
                    <span
                      className="relative flex size-[54px] items-center justify-center rounded-[15px] border-[1.5px] transition-all duration-320"
                      style={{
                        background: on ? r.tone : '#fff',
                        color: on ? '#fff' : 'rgb(var(--kh-muted))',
                        borderColor: on ? r.tone : 'rgb(var(--kh-line))',
                        boxShadow: on
                          ? `0 10px 24px ${r.tone}33`
                          : '0 1px 2px rgba(11,20,82,0.04)',
                        transform: on ? 'scale(1.06)' : 'scale(1)',
                      }}
                    >
                      <Icon size={22} aria-hidden />
                    </span>
                    <span
                      className={`text-[13px] transition-colors ${on ? 'font-bold text-ink' : 'font-medium text-muted'}`}
                    >
                      {r.label}
                    </span>
                    <span className="h-[3px] w-[30px] overflow-hidden rounded-full bg-line-soft">
                      {on && !paused && inView && (
                        <span
                          key={active}
                          className="kh-rolebar block h-full"
                          style={{ background: r.tone }}
                        />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid items-center gap-11 max-[920px]:grid-cols-1 min-[921px]:grid-cols-[0.82fr_1.18fr]">
            <div className="min-h-[150px]">
              <div key={`c${active}`} className="kh-rolecopy">
                <div className="mb-3.5 inline-flex items-center gap-2">
                  <span
                    className="inline-flex size-[30px] items-center justify-center rounded-lg"
                    style={{ background: `${role.tone}16`, color: role.tone }}
                  >
                    <role.icon size={17} aria-hidden />
                  </span>
                  <span
                    className="font-mono text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: role.tone }}
                  >
                    {role.label}
                  </span>
                </div>
                <h3 className="text-[clamp(22px,2.2vw,28px)] font-semibold leading-[1.16] tracking-[-0.02em] text-balance text-ink">
                  {role.headline}
                </h3>
                <p className="mt-3.5 max-w-[380px] text-[15.5px] leading-relaxed text-body">
                  {role.body}
                </p>
              </div>
            </div>

            <div className="relative flex min-h-[360px] items-center justify-center">
              {ROLES.map((r, i) => {
                const Panel = r.Panel
                return (
                  <div
                    key={r.id}
                    className="flex w-full justify-center transition-[opacity,transform] duration-[460ms]"
                    style={{
                      position: i === active ? 'relative' : 'absolute',
                      inset: i === active ? 'auto' : 0,
                      opacity: i === active ? 1 : 0,
                      transform: i === active ? 'none' : 'translateY(10px) scale(0.985)',
                      pointerEvents: i === active ? 'auto' : 'none',
                    }}
                  >
                    <Panel />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
