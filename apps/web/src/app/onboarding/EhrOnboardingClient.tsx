'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Lightbulb } from 'lucide-react'
import { KaribuLockup } from '@/components/karibu-mark'
import { cn } from '@/lib/utils'
import { completeOnboardingModuleAction, refreshOnboardingStatusAction } from './actions'
import { EHR_MODULE_BY_ID, EHR_ONBOARDING_MODULES, type EhrModuleDef } from './ehr-modules'

type View =
  | { k: 'welcome' }
  | { k: 'hub' }
  | { k: 'module'; moduleId: string; stepIndex: number }

function renderCoachText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

function GuidedModule({
  module,
  stepIndex,
  onBack,
  onStepChange,
  onComplete,
  submitting,
  error,
}: {
  module: EhrModuleDef
  stepIndex: number
  onBack: () => void
  onStepChange: (index: number) => void
  onComplete: () => void
  submitting: boolean
  error: string | null
}) {
  const step = module.steps[stepIndex]
  const Mock = module.Mock
  const isLast = stepIndex === module.steps.length - 1
  const [actionDone, setActionDone] = React.useState(false)

  React.useEffect(() => {
    setActionDone(false)
  }, [stepIndex])

  const needsAction = Boolean(step.requiresMockAction)
  const canAdvance = !needsAction || actionDone

  const handleMockAction = (stepId: string) => {
    if (stepId === step.id) setActionDone(true)
  }

  const advance = () => {
    if (!canAdvance) return
    if (isLast) {
      onComplete()
    } else {
      onStepChange(stepIndex + 1)
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-cobalt-ink px-4 py-3 text-white">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-xs text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All modules
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cobalt-soft">
          {module.roleLabel}
        </p>
        <h1 className="text-lg font-semibold text-white">{module.title}</h1>
        <p className="text-xs text-white/75">
          Step {stepIndex + 1} of {module.steps.length}
        </p>
        <div className="mt-2 flex gap-1">
          {module.steps.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                i <= stepIndex ? 'bg-white' : 'bg-white/25',
              )}
            />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Practice screen (training only — no real data saved)
          </p>
          <Mock activeStepId={step.id} onStepAction={handleMockAction} />
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[22rem] lg:border-l lg:border-t-0">
          <div className="flex-1 overflow-auto p-4">
            <h2 className="text-base font-semibold text-foreground">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-body">{renderCoachText(step.body)}</p>

            {step.paper && (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  From paper
                </p>
                <p className="mt-1 text-xs leading-relaxed text-body">{step.paper}</p>
              </div>
            )}

            {step.tip && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-soft/50 p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-ink" />
                <p className="text-xs leading-relaxed text-amber-ink">{step.tip}</p>
              </div>
            )}

            {needsAction && !actionDone && (
              <p className="mt-4 text-xs font-medium text-cobalt">
                Tap the highlighted button on the practice screen to continue.
              </p>
            )}

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>

          <div className="border-t border-border p-4">
            <button
              type="button"
              disabled={!canAdvance || submitting}
              onClick={advance}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-3 text-sm font-medium text-white hover:bg-cobalt-deep disabled:opacity-50"
            >
              {submitting ? 'Saving…' : isLast ? 'Complete module' : 'Next step'}
              {!submitting && !isLast && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

export function EhrOnboardingClient({
  initialCompletedIds,
  allComplete,
}: {
  initialCompletedIds: string[]
  allComplete: boolean
}) {
  const router = useRouter()
  const [completed, setCompleted] = React.useState(() => new Set(initialCompletedIds))
  const [view, setView] = React.useState<View>({ k: 'welcome' })
  const [stepIndex, setStepIndex] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const modules = EHR_ONBOARDING_MODULES.map((m) => ({
    ...m,
    completed: completed.has(m.id),
  }))

  React.useEffect(() => {
    if (allComplete) router.replace('/dashboard')
  }, [allComplete, router])

  const syncFromServer = React.useCallback(async () => {
    try {
      const status = await refreshOnboardingStatusAction()
      setCompleted(new Set(status.progress.map((row) => row.module_id)))
      if (status.completed) router.replace('/dashboard')
    } catch {
      // offline
    }
  }, [router])

  React.useEffect(() => {
    if (view.k !== 'hub' && view.k !== 'welcome') return
    syncFromServer()
    const timer = window.setInterval(syncFromServer, 20_000)
    return () => window.clearInterval(timer)
  }, [view.k, syncFromServer])

  const startModule = (moduleId: string) => {
    setStepIndex(0)
    setError(null)
    setView({ k: 'module', moduleId, stepIndex: 0 })
  }

  const finishModule = async (moduleId: string) => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeOnboardingModuleAction(moduleId)
      setCompleted((prev) => new Set(prev).add(moduleId))
      await syncFromServer()
      if (result.completed) {
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

  if (view.k === 'module') {
    const module = EHR_MODULE_BY_ID[view.moduleId]
    if (!module) {
      setView({ k: 'hub' })
      return null
    }
    return (
      <GuidedModule
        module={module}
        stepIndex={stepIndex}
        onBack={() => setView({ k: 'hub' })}
        onStepChange={setStepIndex}
        onComplete={() => finishModule(module.id)}
        submitting={submitting}
        error={error}
      />
    )
  }

  if (view.k === 'welcome') {
    return (
      <div className="flex h-[100dvh] flex-col bg-cobalt-ink text-white">
        <div className="flex items-center gap-3 px-6 pt-8">
          <KaribuLockup size={32} variant="onDark" />
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Staff training
          </p>
          <h1 className="mt-3 max-w-lg text-3xl font-semibold leading-tight text-white">
            Learn KaribuEHR before your first real patient
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/85">
            Six short modules walk you through the same screens you will use every day — register,
            vitals, clinical notes, lab, pharmacy, and payment. No classroom required.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li>· Practice on safe training screens — nothing is saved to real patients</li>
            <li>· Every role at the clinic should complete all six modules once</li>
            <li>· Takes about 30–45 minutes total, one module at a time</li>
          </ul>
        </div>
        <div className="px-6 pb-10">
          <button
            type="button"
            onClick={() => setView({ k: 'hub' })}
            className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-cobalt-ink hover:bg-cobalt-soft"
          >
            Start training
          </button>
        </div>
      </div>
    )
  }

  const doneCount = modules.filter((m) => m.completed).length

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="shrink-0 bg-cobalt px-5 py-5 text-white">
        <h1 className="text-xl font-semibold">KaribuEHR training</h1>
        <p className="mt-1 text-sm text-white/85">
          {doneCount} of {modules.length} modules complete
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${(doneCount / modules.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="mb-4 text-sm text-muted-foreground">
          Work through each module in order. Tap a card to practice the real EHR workflow with
          step-by-step guidance.
        </p>

        <div className="space-y-3">
          {modules.map((m, index) => (
            <button
              key={m.id}
              type="button"
              onClick={() => startModule(m.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                m.completed
                  ? 'border-accent/40 bg-accent/5 hover:bg-accent/10'
                  : 'border-border bg-card hover:border-cobalt/40 hover:bg-cobalt-soft/30',
              )}
            >
              {m.completed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {index + 1}. {m.roleLabel}
                </p>
                <p className="font-semibold text-foreground">{m.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{m.subtitle}</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
