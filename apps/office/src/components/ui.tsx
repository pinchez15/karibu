import type { ReactNode } from 'react'
import { t } from '@/i18n'
import { PIPELINE_STAGES, type ClinicStage, type HealthScore } from '@/lib/types'
import { waLink } from '@/lib/share'

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="notice-danger">{error}</p>
  if (ok) return <p role="status" className="notice-success">{ok}</p>
  return null
}

export function PageHeader({ title, sub, back, backLabel, action }: { title: string; sub?: ReactNode; back?: string; backLabel?: string; action?: ReactNode }) {
  return (
    <div className="wide flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        {back ? <a href={back} className="mb-1 inline-block text-sm font-medium text-coral">← {backLabel ?? t('common.back')}</a> : null}
        <h1 className="break-words lg:text-[26px]">{title}</h1>
        {sub ? <p className="mt-1 text-[15px]">{sub}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}

/** One number with its label and a line of context. The value is text, so the caller formats it. */
export function Stat({ label, value, note, href, tone }: { label: string; value: ReactNode; note?: ReactNode; href?: string; tone?: 'warn' }) {
  const body = (
    <>
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="num mt-0.5 block text-[22px] font-semibold leading-tight text-ink">{value}</span>
      {note ? <span className="mt-1 block text-[13px]">{note}</span> : null}
    </>
  )
  const cls = `card block ${tone === 'warn' ? 'border-amber/50 bg-amber-soft/40' : ''}`
  return href ? <a href={href} className={`${cls} hover:border-ink/30`}>{body}</a> : <div className={cls}>{body}</div>
}

/** Page-level tabs. Plain links, so they work without JavaScript. */
export function Tabs({ items }: { items: { href: string; label: string; on?: boolean; badge?: number }[] }) {
  return (
    <nav className="wide tabs">
      {items.map((i) => (
        <a key={i.href} href={i.href} aria-current={i.on ? 'page' : undefined} className={`tab ${i.on ? 'tab-on' : ''}`}>
          {i.label}
          {i.badge ? <span className="chip-warning ml-1.5">{i.badge}</span> : null}
        </a>
      ))}
    </nav>
  )
}

/** A thin horizontal meter. `parts` are drawn in order; the remainder is the track. */
export function Meter({ parts, label }: { parts: { value: number; className: string }[]; label: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return (
    <span role="img" aria-label={label} className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line-soft">
      {total > 0 ? parts.filter((p) => p.value > 0).map((p, i) => (
        <span key={i} className={`rounded-full ${p.className}`} style={{ flex: p.value }} />
      )) : null}
    </span>
  )
}

/** Vertical bars. Heights are relative to the largest value. */
export function Bars({ values, label, height = 96, highlightLast }: { values: { value: number; title: string; className?: string }[]; label: string; height?: number; highlightLast?: boolean }) {
  const peak = Math.max(1, ...values.map((v) => v.value))
  return (
    <div role="img" aria-label={label} className="flex items-end gap-1 border-b border-line" style={{ height }}>
      {values.map((v, i) => (
        <span
          key={i} title={v.title}
          className={`flex-1 rounded-t ${v.className ?? (highlightLast && i === values.length - 1 ? 'bg-coral-bright' : 'bg-coral-bright/40')}`}
          style={{ height: `${Math.max(2, (v.value / peak) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** What a screen says before it has anything to show: what it is for, and the way to start. */
export function Empty({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card max-w-xl space-y-3">
      <div className="space-y-1">
        <p className="font-semibold text-ink">{title}</p>
        {body ? <p className="text-sm">{body}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

const STAGE_CHIP: Record<ClinicStage, string> = {
  lead: 'chip-neutral', contacted: 'chip-neutral', demo: 'chip-neutral', readiness: 'chip-info',
  configured: 'chip-info', trained: 'chip-info', kit_delivered: 'chip-info',
  live: 'chip-success', steady: 'chip-success', billed: 'chip-success', churned: 'chip-neutral',
}

export function StageChip({ stage }: { stage: ClinicStage }) {
  return <span className={STAGE_CHIP[stage]}>{t(`clinics.stage.${stage}`)}</span>
}

/** Where a clinic is on the road from lead to billed. Scrolls sideways on a phone. */
export function StageTrack({ stage }: { stage: ClinicStage }) {
  if (stage === 'churned') return <StageChip stage={stage} />
  const at = PIPELINE_STAGES.indexOf(stage)
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label={t('clinic.stageTitle')}>
      {PIPELINE_STAGES.map((s, i) => (
        <li key={s} className="min-w-[4.75rem] flex-1" aria-current={i === at ? 'step' : undefined}>
          <span className={`block h-1.5 rounded-full ${i > at ? 'bg-line' : i >= 7 ? 'bg-green' : 'bg-coral-bright'}`} />
          <span className={`mt-1 block truncate text-[11px] ${i === at ? 'font-semibold text-ink' : i < at ? 'text-body' : 'text-muted'}`}>
            {t(`clinics.stage.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}

const HEALTH_CHIP: Record<HealthScore, string> = { green: 'chip-success', amber: 'chip-warning', red: 'chip-danger' }

export function HealthChip({ score }: { score: HealthScore }) {
  return <span className={HEALTH_CHIP[score]}>{t(`clinics.health.${score}`)}</span>
}

/** One-tap share. A plain link: no client JS, works on any phone with WhatsApp. */
export function WhatsAppButton({ text, phone, label, title, className = 'btn-whatsapp' }: { text: string; phone?: string | null; label?: string; title?: string; className?: string }) {
  return (
    <a className={className} href={waLink(text, phone)} title={title} target="_blank" rel="noopener noreferrer">
      {label ?? t('common.shareWhatsApp')}
    </a>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-normal text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
