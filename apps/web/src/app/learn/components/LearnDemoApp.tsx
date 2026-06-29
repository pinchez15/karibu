'use client'

import React from 'react'
import Link from 'next/link'
import { Walkthrough } from './Walkthrough'
import { CaseLanding } from './screens'
import { loadDemoCase } from '../lib/demo-case'
import type { LearnCase } from '../lib/types'
import { KL, KH } from '../lib/tokens'
import { Btn } from '../lib/ui'
import { KMark } from '../lib/icons'

type View =
  | { k: 'loading' }
  | { k: 'error'; message: string }
  | { k: 'intro'; c: LearnCase }
  | { k: 'walk'; c: LearnCase }
  | { k: 'done'; c: LearnCase; score: number; total: number }

/** Public demo — no auth, no localStorage progress. */
export function LearnDemoApp() {
  const [view, setView] = React.useState<View>({ k: 'loading' })

  React.useEffect(() => {
    loadDemoCase()
      .then((c) => setView({ k: 'intro', c }))
      .catch((e) =>
        setView({ k: 'error', message: e instanceof Error ? e.message : 'Could not load demo' }),
      )
  }, [])

  if (view.k === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-body" style={{ fontFamily: KH.font, background: KL.bg }}>
        Loading demo case…
      </div>
    )
  }

  if (view.k === 'error') {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center" style={{ fontFamily: KH.font, background: KL.bg }}>
        <p className="text-body">{view.message}</p>
        <Link href="/learn" className="rounded-[10px] bg-coral px-4 py-2.5 text-sm font-semibold text-white no-underline">
          Back
        </Link>
      </div>
    )
  }

  if (view.k === 'walk') {
    return (
      <Walkthrough
        c={view.c}
        onExit={() => setView({ k: 'intro', c: view.c })}
        onComplete={(score, total) => setView({ k: 'done', c: view.c, score, total })}
      />
    )
  }

  if (view.k === 'done') {
    const pct = view.total > 0 ? Math.round((view.score / view.total) * 100) : 100
    return (
      <div className="flex h-[100dvh] flex-col" style={{ background: KL.bg, fontFamily: KH.font }}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <KMark size={48} color={KL.primary} />
          <h1 className="mt-5 text-[28px] font-semibold text-ink">Demo complete</h1>
          <p className="mt-2 max-w-md text-body leading-relaxed">
            {view.c.title} — {pct}% on practice questions. Nothing was saved; you can replay any time.
          </p>
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:justify-center">
          <Btn kind="primary" onClick={() => setView({ k: 'walk', c: view.c })}>
            Replay demo
          </Btn>
          <Link
            href="/learn"
            className="inline-flex items-center justify-center rounded-[10px] border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink no-underline"
          >
            Back to Coming Soon
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ background: KL.bg, fontFamily: KH.font }}>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <Link href="/learn" className="text-[13px] font-medium text-muted hover:text-ink">
          ← Coming Soon
        </Link>
        <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-coral-deep">
          Public demo
        </span>
      </header>
      <div className="flex-1 overflow-auto px-4 py-6">
        <CaseLanding
          c={view.c}
          onBegin={(c) => setView({ k: 'walk', c })}
          onBack={() => (window.location.href = '/learn')}
        />
      </div>
    </div>
  )
}
