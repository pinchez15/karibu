import { Check, GraduationCap, Mic, Sparkles } from 'lucide-react'
import { KLockup, KMark } from './brand'
import { AndroidPatientScreen, WebDashboardScreen, WebQueueScreen } from './device-screens'

export function Waveform({
  color = 'rgba(255,255,255,0.9)',
  bars = 28,
  height = 30,
  active = true,
}: {
  color?: string
  bars?: number
  height?: number
  active?: boolean
}) {
  return (
    <div className="flex items-center gap-[3px]" style={{ height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={active ? 'kh-wave' : ''}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: active ? '100%' : 6,
            animationDelay: `${(i % 9) * 0.09}s`,
            transformOrigin: 'center',
            opacity: 0.5 + (Math.sin(i * 1.7) + 1) * 0.25,
          }}
        />
      ))}
    </div>
  )
}

function Phone({
  children,
  w = 280,
  statusInk = 'rgb(var(--kh-ink))',
  statusBg = '#fff',
  showStatusBar = true,
}: {
  children: React.ReactNode
  w?: number
  statusInk?: string
  statusBg?: string
  showStatusBar?: boolean
}) {
  const bezel = 7
  const screenH = Math.round(w * 2.05)
  const outerRadius = Math.round(w * 0.145)
  const screenRadius = Math.round(w * 0.118)

  return (
    <div
      className="relative shrink-0 bg-[#12151f]"
      style={{
        width: w + bezel * 2,
        height: screenH + bezel * 2,
        borderRadius: outerRadius,
        padding: bezel,
        boxShadow:
          '0 2px 4px rgba(11,20,82,.15), 0 24px 56px rgba(11,20,82,.22), inset 0 0 0 1px rgba(255,255,255,.06)',
      }}
    >
      {/* Power button */}
      <div
        className="absolute rounded-l-sm bg-[#2a2f3d]"
        style={{ right: -2, top: '22%', width: 3, height: w * 0.14 }}
      />
      {/* Volume buttons */}
      <div
        className="absolute rounded-r-sm bg-[#2a2f3d]"
        style={{ left: -2, top: '18%', width: 3, height: w * 0.07 }}
      />
      <div
        className="absolute rounded-r-sm bg-[#2a2f3d]"
        style={{ left: -2, top: '28%', width: 3, height: w * 0.07 }}
      />

      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-black"
        style={{ borderRadius: screenRadius }}
      >
        {/* Dynamic island */}
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-black"
          style={{ top: 8, width: w * 0.32, height: Math.max(18, w * 0.075) }}
        />

        {showStatusBar && (
          <div
            className="relative z-10 flex shrink-0 items-center justify-between"
            style={{
              height: w * 0.11,
              padding: `${w * 0.04}px ${w * 0.06}px 0`,
              color: statusInk,
              background: statusBg,
            }}
          >
            <span className="font-mono font-semibold" style={{ fontSize: w * 0.038 }}>
              9:41
            </span>
            <span className="flex items-center opacity-80" style={{ gap: w * 0.016 }}>
              <span className="font-mono" style={{ fontSize: w * 0.032 }}>
                4G
              </span>
              <span
                className="relative rounded-sm border-[1.4px]"
                style={{
                  width: w * 0.048,
                  height: w * 0.026,
                  borderColor: statusInk,
                }}
              >
                <span
                  className="absolute inset-[1.4px] rounded-[1px]"
                  style={{ right: w * 0.016, background: statusInk }}
                />
              </span>
            </span>
          </div>
        )}

        <div className="relative flex-1 overflow-hidden">{children}</div>

        {/* Home indicator */}
        <div
          className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/25"
          style={{ width: w * 0.28, height: 4 }}
        />
      </div>
    </div>
  )
}

export function HeroEHR() {
  return (
    <div className="relative mx-auto w-full max-w-[320px] max-[920px]:max-w-[280px]">
      <Phone w={280}>
        <div className="flex h-full flex-col bg-[rgb(var(--kh-bg))]">
          <div className="bg-cobalt-ink px-3.5 py-[11px] text-white">
            <div className="flex items-center gap-2">
              <KMark size={18} color="#fff" fg="rgb(var(--kh-cobalt))" />
              <span className="text-[13px] font-bold tracking-[-0.01em]">
                Karibu<span className="font-medium opacity-65">.health</span>
              </span>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] text-white/60">
                <span className="size-[5px] rounded-full bg-green" />
                OFFLINE OK
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-line bg-white px-3.5 py-2">
            <div className="flex size-[30px] items-center justify-center rounded-lg bg-cobalt-soft text-xs font-bold text-cobalt">
              NS
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                Nakato Sarah{' '}
                <span className="font-mono text-[10px] font-normal text-muted">34F</span>
              </div>
              <div className="font-mono text-[9px] tracking-wide text-muted">
                PT-100015 · VISIT 09:42
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col p-3.5">
            <div className="mb-2 font-mono text-[9.5px] font-semibold tracking-wider text-muted">
              POST-VISIT NOTE
            </div>
            <div className="rounded-[13px] bg-cobalt p-3.5 text-white shadow-[0_8px_22px_rgba(31,54,199,0.28)]">
              <div className="mb-3 flex items-center gap-2">
                <span className="kh-rec-dot size-2 rounded-full bg-white" />
                <span className="text-xs font-semibold">Recording</span>
                <span className="ml-auto font-mono text-xs opacity-90">0:47</span>
              </div>
              <Waveform height={28} bars={26} />
              <p className="mt-3 text-[11.5px] leading-snug text-white/90">
                &ldquo;…three days of fever and headache, RDT positive for falciparum, started on
                AL four tablets twice daily…&rdquo;
              </p>
            </div>
            <div className="my-4 flex justify-center">
              <div className="relative size-[58px]">
                <span className="kh-mic-ring absolute inset-0 rounded-full border-2 border-cobalt" />
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-cobalt text-white shadow-[0_6px_16px_rgba(31,54,199,0.32)]">
                  <Mic size={24} aria-hidden />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[7px]">
              {[
                ['S', 'Fever ×3d, headache, weakness'],
                ['O', 'T 38.4 · RDT +ve P. falciparum'],
                ['A', 'Uncomplicated malaria — B54'],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-2 rounded-[9px] border border-line bg-white px-2.5 py-2"
                >
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-cobalt-soft font-mono text-[10px] font-bold text-cobalt">
                    {k}
                  </span>
                  <span className="truncate text-[11px] text-body">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Phone>

      <div className="kh-float-a absolute left-0 top-[100px] w-[min(196px,42vw)] rounded-xl border border-line bg-white p-[11px_13px] shadow-[0_16px_40px_rgba(11,20,82,0.16)] max-[920px]:hidden min-[921px]:left-[-70px]">
        <div className="mb-1 flex items-center gap-[7px] text-amber">
          <Sparkles size={14} aria-hidden />
          <span className="whitespace-nowrap font-mono text-[9.5px] font-bold tracking-wider">
            AI STRUCTURING
          </span>
        </div>
        <p className="text-[11.5px] leading-snug text-body">
          Optionally turns your dictation into a draft note to review.
        </p>
      </div>

      <div className="kh-float-b absolute bottom-[72px] right-0 w-[min(170px,38vw)] rounded-xl border border-line bg-white p-[11px_13px] shadow-[0_16px_40px_rgba(11,20,82,0.16)] max-[920px]:hidden min-[921px]:right-[-56px]">
        <div className="flex items-center gap-2">
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-green-soft text-green">
            <Check size={15} aria-hidden />
          </span>
          <div>
            <div className="text-xs font-bold text-ink">Draft saved</div>
            <div className="font-mono text-[9.5px] text-muted">Review & sign when ready</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DictationFlow() {
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-3">
      <div className="rounded-[14px] bg-cobalt p-4 text-white shadow-[0_14px_34px_rgba(31,54,199,0.24)]">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/15">
            <Mic size={19} className="text-white" aria-hidden />
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">You speak, after the visit</div>
            <div className="font-mono text-[10.5px] opacity-85">0:47 · ENGLISH</div>
          </div>
          <Waveform color="rgba(255,255,255,0.85)" height={24} bars={14} />
        </div>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <span className="h-3.5 w-0.5 bg-line" />
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-wider text-amber">
          <Sparkles size={13} aria-hidden />
          AI CAN STRUCTURE IT
        </span>
      </div>
      <div className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(11,20,82,0.04)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-bold tracking-wider text-muted">
            CLINICAL NOTE · DRAFT
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-semibold text-amber-ink">
            <Sparkles size={11} aria-hidden />
            AI optional
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            ['S', 'Fever and headache ×3 days, generalised weakness. Took paracetamol with little relief.'],
            ['O', 'T 38.4 °C · BP 128/82 · RDT positive, P. falciparum.'],
            ['A', 'Uncomplicated malaria (B54).'],
            ['P', 'Artemether-lumefantrine 4 tabs BD ×3d. Return if vomiting or confusion.'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-cobalt-soft font-mono text-[11px] font-bold text-cobalt">
                {k}
              </span>
              <span className="text-[13px] leading-snug text-body">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex gap-2">
          <span className="flex-1 rounded-[9px] bg-cobalt py-2 text-center text-[13px] font-semibold text-white">
            Review & sign
          </span>
          <span className="rounded-[9px] border border-line bg-white px-4 py-2 text-[13px] font-semibold text-body">
            Edit
          </span>
        </div>
      </div>
    </div>
  )
}

export function DeviceScale() {
  const phoneW = 92
  const tabletW = 168
  const laptopW = 280

  function DeviceFrame({
    children,
    w,
    h,
    label,
    sub,
    className = '',
  }: {
    children: React.ReactNode
    w: number
    h: number
    label: string
    sub: string
    className?: string
  }) {
    const bezel = 5
    const radius = Math.round(w * 0.12)
    const screenRadius = Math.round(w * 0.09)
    return (
      <div className={`shrink-0 text-center ${className}`}>
        <div
          className="mx-auto bg-[#12151f]"
          style={{
            width: w + bezel * 2,
            height: h + bezel * 2,
            borderRadius: radius,
            padding: bezel,
            boxShadow: '0 12px 32px rgba(11,20,82,.18)',
          }}
        >
          <div
            className="h-full w-full overflow-hidden bg-white"
            style={{ borderRadius: screenRadius }}
          >
            {children}
          </div>
        </div>
        <div className="mt-3 font-mono text-[10px] tracking-wide text-muted">{label}</div>
        <div className="text-xs font-medium text-body">{sub}</div>
      </div>
    )
  }

  return (
    <div className="-mx-2 flex items-end justify-center gap-4 overflow-x-auto px-2 pb-2 max-[920px]:snap-x max-[920px]:snap-mandatory sm:gap-6 min-[921px]:gap-[26px]">
      <DeviceFrame w={phoneW} h={188} label="PHONE" sub="Android app" className="max-[920px]:snap-center">
        <AndroidPatientScreen scale={0.85} />
      </DeviceFrame>

      <DeviceFrame w={tabletW} h={220} label="TABLET" sub="Queue & check-in" className="max-[920px]:snap-center">
        <WebQueueScreen scale={1.05} />
      </DeviceFrame>

      <div className="shrink-0 text-center max-[920px]:snap-center">
        <div>
          <div
            className="mx-auto bg-[#12151f]"
            style={{
              width: laptopW + 10,
              height: 168,
              borderRadius: 10,
              padding: 5,
              boxShadow: '0 12px 32px rgba(11,20,82,.18)',
            }}
          >
            <div className="h-full w-full overflow-hidden rounded-[5px] bg-white">
              <WebDashboardScreen scale={1.15} />
            </div>
          </div>
          <div
            className="mx-auto bg-gradient-to-b from-[#cbd2e6] to-[#aeb7d4]"
            style={{ width: laptopW + 44, height: 8, borderRadius: '0 0 8px 8px', marginTop: -1 }}
          />
        </div>
        <div className="mt-3 font-mono text-[10px] tracking-wide text-muted">LAPTOP</div>
        <div className="text-xs font-medium text-body">Web dashboard</div>
      </div>
    </div>
  )
}

export function RecordTimeline() {
  const visits = [
    { d: '07 May', t: 'Malaria · B54', meta: 'AL prescribed · RDT +ve', cobalt: true },
    { d: '02 Mar', t: 'Antenatal · 2nd visit', meta: 'BP 118/76 · 24 wks', cobalt: false },
    { d: '14 Jan', t: 'Upper resp. infection', meta: 'Symptomatic care', cobalt: false },
  ]

  return (
    <div className="rounded-2xl border border-line bg-white p-[22px] shadow-[0_1px_2px_rgba(11,20,82,0.04)]">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-[38px] items-center justify-center rounded-[10px] bg-cobalt-soft text-sm font-bold text-cobalt">
          NS
        </div>
        <div>
          <div className="text-[15px] font-bold text-ink">Nakato Sarah</div>
          <div className="font-mono text-[11px] text-muted">PT-100015 · 34F · 3 visits</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-[11px] font-semibold text-green">
          <Check size={12} aria-hidden />
          One record
        </span>
      </div>
      <div className="relative pl-[22px]">
        <div className="absolute bottom-1.5 left-[5px] top-1.5 w-0.5 bg-line" />
        {visits.map((v, i) => {
          const c = v.cobalt ? 'rgb(var(--kh-cobalt))' : 'rgb(var(--kh-slate))'
          return (
            <div key={v.d} className={i < visits.length - 1 ? 'relative pb-4' : 'relative'}>
              <span
                className="absolute -left-[22px] top-[3px] size-3 rounded-full border-[3px] bg-white"
                style={{ borderColor: c }}
              />
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 font-mono text-[11px] text-muted">{v.d}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{v.t}</div>
                  <div className="mt-px text-xs text-muted">{v.meta}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PhoneLearn() {
  return (
    <Phone w={264} statusInk="#fff">
      <div
        className="relative flex h-full flex-col overflow-hidden px-[18px] pt-[18px] text-white"
        style={{
          background: 'linear-gradient(135deg, #FF8253 0%, #FB4D5B 48%, #E5305F 100%)',
        }}
      >
        <div className="pointer-events-none absolute -right-[20%] -top-[14%] size-[200px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_62%)]" />
        <div className="relative">
          <KLockup
            size={22}
            markColor="#fff"
            markFg="rgb(var(--kh-coral))"
            textColor="#fff"
            suffix=".learn"
            suffixColor="rgba(255,255,255,0.72)"
          />
        </div>
        <div className="relative mt-auto">
          <div className="mb-2 font-mono text-[9.5px] tracking-widest opacity-85">
            CASE · FEBRILE ILLNESS
          </div>
          <div className="text-[21px] font-bold leading-tight tracking-[-0.02em]">
            Fever and headache, 3 days
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[9px] bg-white px-3.5 py-2 text-xs font-bold text-coral-deep">
              <GraduationCap size={14} aria-hidden />
              Start case
            </span>
            <span className="font-mono text-[10px] opacity-90">12 min · CME</span>
          </div>
        </div>
        <div className="-mx-[18px] relative mt-4 rounded-t-[14px] bg-white p-3.5 text-ink">
          <div className="mb-1.5 flex items-center gap-1.5 text-coral-deep">
            <Sparkles size={13} aria-hidden />
            <span className="font-mono text-[8.5px] font-bold tracking-wider">LEARN COACH</span>
          </div>
          <p className="text-xs leading-snug text-body">
            Decide what to ask, what to test, and what to treat — the way you would on a busy
            morning.
          </p>
        </div>
      </div>
    </Phone>
  )
}
