import { Globe } from 'lucide-react'
import { KLockup } from './brand'
import { BOOK_DEMO_MAILTO, CAPPAWORK_HREF, LEARN_DEMO_HREF, LEARN_HREF } from './constants'
import { Container } from './ui'

const COLS = [
  [
    'Karibu EHR',
    [
      ['Overview', '#ehr'],
      ['Dictation', '#ehr'],
      ['Works offline', '#ehr'],
      ['Apply for your clinic', '#apply'],
    ],
  ],
  [
    'Karibu Learn',
    [
      ['Coming soon', LEARN_HREF],
      ['Try demo case', LEARN_DEMO_HREF],
      ['How it works', '#learn'],
      ['CME credit', '#learn'],
    ],
  ],
  [
    'Company',
    [
      ['About', '#about'],
      ['Built in Uganda', '#why'],
      ['Contact', '#apply'],
      ['Book a demo', BOOK_DEMO_MAILTO],
    ],
  ],
] as const

export function Footer() {
  return (
    <footer id="about" className="landing-dark bg-cobalt-ink pb-9 pt-12 text-white sm:pt-16">
      <Container>
        <div className="grid gap-10 border-b border-white/10 pb-12 max-[920px]:grid-cols-2 min-[921px]:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-[920px]:col-span-2">
            <KLockup
              size={32}
              markColor="#fff"
              markFg="rgb(var(--kh-cobalt))"
              textColor="#fff"
              suffix=".health"
              suffixColor="rgba(255,255,255,0.6)"
            />
            <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-white/65">
              Clinical software built for Uganda from the first step. An EHR for every clinic, and a
              classroom for every clinician.
            </p>
            <div className="mt-5 flex gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-[11px] py-[5px] font-mono text-[11px] text-white/60">
                <Globe size={13} aria-hidden />
                Kampala, Uganda
              </span>
            </div>
          </div>

          {COLS.map(([heading, items]) => (
            <div key={heading}>
              <div className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-white/50">
                {heading}
              </div>
              <div className="flex flex-col gap-[11px]">
                {items.map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    className="text-sm text-white/80 no-underline transition-colors hover:text-white"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="text-[13px] text-white/50">
            <span>
              Karibu EHR and Karibu Learn are{' '}
              <a
                href={CAPPAWORK_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                CappaWork
              </a>{' '}
              products. © {new Date().getFullYear()} CappaWork LLC. All rights reserved.
            </span>
          </div>
          <span className="font-mono text-[11px] tracking-wide text-white/40">
            NO REAL PATIENT DATA APPEARS ON THIS SITE
          </span>
        </div>
      </Container>
    </footer>
  )
}
