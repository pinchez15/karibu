'use client'

import Link from 'next/link'
import { KL, KH } from '../lib/tokens'
import { KMark } from '../lib/icons'
import { Eyebrow } from '../lib/ui'

export function LearnComingSoon() {
  return (
    <div
      className="flex h-[100dvh] flex-col"
      style={{ background: KL.grad, color: '#fff', fontFamily: KH.font }}
    >
      <header className="flex items-center gap-3 px-6 py-5">
        <KMark size={28} color="#fff" fg={KL.primary} />
        <span className="text-lg font-bold tracking-tight">
          Karibu<span style={{ opacity: 0.72, fontWeight: 500 }}>.learn</span>
        </span>
        <Link
          href="/"
          className="ml-auto text-[13px] font-medium text-white/80 hover:text-white"
        >
          ← Karibu Health
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <Eyebrow color="rgba(255,255,255,0.85)">Coming soon</Eyebrow>
        <h1 className="mt-4 max-w-lg text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em]">
          Free clinical CME for Uganda — on your phone.
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/88">
          Karibu Learn is in development. Work realistic cases inside a faithful copy of the EHR —
          generated patients only, no clinic account required.
        </p>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/72">
          Sign in will be optional when we launch — to save CME credit and certificates.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/learn/demo"
            className="inline-flex items-center justify-center rounded-[10px] bg-white px-[22px] py-[13px] text-[15px] font-semibold text-coral-deep no-underline transition-[filter] hover:brightness-95"
          >
            Try the demo case
          </Link>
          <Link
            href="/#learn"
            className="inline-flex items-center justify-center rounded-[10px] border border-white/35 bg-white/10 px-[22px] py-[13px] text-[15px] font-semibold text-white no-underline transition-[filter] hover:brightness-95"
          >
            Back to Karibu Health
          </Link>
        </div>

        <p className="mt-8 max-w-sm text-[12px] leading-relaxed text-white/60">
          Karibu Learn is a{' '}
          <a href="https://www.cappawork.com" className="underline underline-offset-2 hover:text-white/80">
            CappaWork
          </a>{' '}
          product, separate from Karibu EHR.
        </p>
      </div>
    </div>
  )
}
