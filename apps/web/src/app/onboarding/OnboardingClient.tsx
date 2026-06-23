'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { KL, KH } from '@/app/learn/lib/tokens'
import { Icon, KMark } from '@/app/learn/lib/icons'
import { Btn, Eyebrow, Meta } from '@/app/learn/lib/ui'
import { Walkthrough } from '@/app/learn/components/Walkthrough'
import type { LearnCase } from '@/app/learn/lib/types'
import type { OnboardingManifest, OnboardingModule } from '@karibu/shared'
import { completeOnboardingModuleAction, refreshOnboardingStatusAction } from './actions'
import * as data from '@/app/learn/lib/data'

type ModuleRow = OnboardingModule & { completed: boolean }

type View =
  | { k: 'welcome' }
  | { k: 'hub' }
  | { k: 'intro'; module: ModuleRow }
  | { k: 'walk'; module: ModuleRow; c: LearnCase }
  | { k: 'complete'; module: ModuleRow; c: LearnCase; score: number; total: number }

export function OnboardingClient({
  manifest,
  initialCompletedIds,
  allComplete,
}: {
  manifest: OnboardingManifest
  initialCompletedIds: string[]
  allComplete: boolean
}) {
  const router = useRouter()
  const [completed, setCompleted] = React.useState(() => new Set(initialCompletedIds))
  const [view, setView] = React.useState<View>({ k: 'welcome' })
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const modules: ModuleRow[] = React.useMemo(
    () =>
      [...manifest.modules]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({ ...m, completed: completed.has(m.id) })),
    [manifest.modules, completed],
  )

  React.useEffect(() => {
    if (allComplete) router.replace('/dashboard')
  }, [allComplete, router])

  const syncFromServer = React.useCallback(async () => {
    try {
      const status = await refreshOnboardingStatusAction()
      setCompleted(new Set(status.progress.map((row) => row.module_id)))
      if (status.completed) {
        router.replace('/dashboard')
      }
    } catch {
      // Offline or session expired — keep local module set.
    }
  }, [router])

  // Hub/welcome poll so laptop ↔ phone stay in sync on shared Clerk account.
  React.useEffect(() => {
    if (view.k !== 'hub' && view.k !== 'welcome') return
    syncFromServer()
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncFromServer()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(syncFromServer, 20_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [view.k, syncFromServer])

  const openModule = async (module: ModuleRow) => {
    setError(null)
    try {
      const packs = await data.loadManifest()
      const pack = packs.find((p) => p.id === module.pack_id)
      if (!pack) throw new Error('Training pack missing')
      const cases = await data.loadInstalledCases([pack])
      const c = cases.find((row) => row.id === module.case_id)
      if (!c) throw new Error('Training case missing')
      setView({ k: 'intro', module })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load case')
    }
  }

  const finishModule = async (module: ModuleRow, score: number, total: number) => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeOnboardingModuleAction(module.id, score, total)
      setCompleted((prev) => new Set(prev).add(module.id))
      await syncFromServer()
      if (result?.completed) {
        router.replace('/dashboard')
      } else {
        setView({ k: 'hub' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save progress')
    } finally {
      setSubmitting(false)
    }
  }

  if (view.k === 'walk') {
    return (
      <Walkthrough
        c={view.c}
        onExit={() => setView({ k: 'intro', module: view.module })}
        onComplete={(score, total) => setView({ k: 'complete', module: view.module, c: view.c, score, total })}
      />
    )
  }

  if (view.k === 'complete') {
    const pct = view.total > 0 ? Math.round((view.score / view.total) * 100) : 100
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: KL.bg, fontFamily: KH.font }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <KMark size={48} color={KL.primary} />
          <h1 style={{ fontSize: 28, margin: '18px 0 8px', color: KL.ink }}>Module complete</h1>
          <p style={{ color: KL.body, maxWidth: 420, lineHeight: 1.5 }}>
            {view.module.title} — {pct}% on practice questions. Save progress to unlock the next module.
          </p>
          {error && <p style={{ color: KL.primary, marginTop: 12 }}>{error}</p>}
        </div>
        <div style={{ padding: 20 }}>
          <Btn onClick={() => finishModule(view.module, view.score, view.total)} disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Saving…' : 'Continue'}
          </Btn>
        </div>
      </div>
    )
  }

  if (view.k === 'intro') {
    const m = view.module
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: KL.bg, fontFamily: KH.font }}>
        <div style={{ background: KL.grad, padding: 24, color: '#fff' }}>
          <button type="button" onClick={() => setView({ k: 'hub' })} style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', fontSize: 13 }}>
            ← Modules
          </button>
          <Eyebrow color="rgba(255,255,255,0.85)" style={{ marginTop: 16 }}>Simulated role · {m.simulated_role.replace(/_/g, ' ')}</Eyebrow>
          <h1 style={{ fontSize: 26, margin: '8px 0 4px' }}>{m.title}</h1>
          <p style={{ opacity: 0.9, margin: 0 }}>{m.subtitle}</p>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <p style={{ color: KL.body, lineHeight: 1.55 }}>{m.coach_intro}</p>
          {m.web_bonus && (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: KH.cobaltSoft, border: `1px solid ${KH.cobalt}22` }}>
              <Eyebrow color={KH.cobalt}>Web bonus</Eyebrow>
              <p style={{ margin: '8px 0 0', color: KL.ink, fontSize: 14, lineHeight: 1.5 }}>{m.web_bonus}</p>
            </div>
          )}
          <p style={{ marginTop: 20, fontSize: 13, color: KL.muted }}>
            Primary training is on Android. This web walkthrough mirrors the same case so you can practice on a laptop too.
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <Btn
            onClick={async () => {
              const packs = await data.loadManifest()
              const pack = packs.find((p) => p.id === m.pack_id)
              if (!pack) return
              const cases = await data.loadInstalledCases([pack])
              const c = cases.find((row) => row.id === m.case_id)
              if (c) setView({ k: 'walk', module: m, c })
            }}
            style={{ width: '100%' }}
          >
            {m.completed ? 'Practice again' : 'Begin module'}
          </Btn>
        </div>
      </div>
    )
  }

  if (view.k === 'welcome') {
    return (
      <div style={{ height: '100dvh', background: KL.grad, color: '#fff', fontFamily: KH.font, display: 'flex', flexDirection: 'column', padding: '28px 26px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <KMark size={28} color="#fff" />
          <span style={{ fontWeight: 700, fontSize: 18 }}>KaribuEHR</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Meta style={{ color: 'rgba(255,255,255,0.85)' }}>STAFF TRAINING</Meta>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, margin: '14px 0 16px' }}>Learn every role before your first patient.</h1>
          <p style={{ opacity: 0.92, lineHeight: 1.55, maxWidth: 520 }}>{manifest.subtitle}</p>
          <p style={{ marginTop: 20, fontSize: 12, opacity: 0.85 }}>{modules.length} modules · all roles · required on phone; web adds desk-wide views</p>
        </div>
        <Btn onClick={() => setView({ k: 'hub' })} kind="onDark" style={{ width: '100%' }}>Start training</Btn>
      </div>
    )
  }

  const done = modules.filter((m) => m.completed).length
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: KL.bg, fontFamily: KH.font }}>
      <header style={{ background: KH.cobalt, color: '#fff', padding: '20px 22px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{manifest.title}</h1>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: 13 }}>{done} of {modules.length} modules complete</p>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <p style={{ color: KL.primary, fontSize: 13 }}>{error}</p>}
        {modules.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => openModule(m)}
            style={{
              textAlign: 'left',
              border: `1px solid ${m.completed ? KH.green : KL.line}`,
              background: m.completed ? KH.greenSoft : KL.surface,
              borderRadius: 14,
              padding: 14,
              cursor: 'pointer',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Icon name={m.completed ? 'check' : 'cases'} size={20} color={m.completed ? KH.green : KH.cobalt} />
            <div style={{ flex: 1 }}>
              <Meta>{m.simulated_role.replace(/_/g, ' ')}</Meta>
              <div style={{ fontWeight: 600, color: KL.ink }}>{m.title}</div>
              <div style={{ fontSize: 12, color: KL.body }}>{m.subtitle}</div>
            </div>
            <Icon name="arrowRight" size={16} color={KL.muted} />
          </button>
        ))}
      </div>
    </div>
  )
}
