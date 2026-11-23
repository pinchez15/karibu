import type { ReactNode } from 'react'
import { t } from '@/i18n'
import type { ClinicStage, HealthScore } from '@/lib/types'
import { waLink } from '@/lib/share'

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="notice-danger">{error}</p>
  if (ok) return <p role="status" className="notice-success">{ok}</p>
  return null
}

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back ? <a href={back} className="mb-1 inline-block text-sm font-medium text-cobalt">← {t('common.back')}</a> : null}
        <h1 className="break-words">{title}</h1>
      </div>
      {action}
    </div>
  )
}

const STAGE_CHIP: Record<ClinicStage, string> = {
  lead: 'chip-neutral', contacted: 'chip-neutral', demo: 'chip-info', readiness: 'chip-info',
  configured: 'chip-info', trained: 'chip-info', kit_delivered: 'chip-info',
  live: 'chip-success', steady: 'chip-success', billed: 'chip-success', churned: 'chip-neutral',
}

export function StageChip({ stage }: { stage: ClinicStage }) {
  return <span className={STAGE_CHIP[stage]}>{t(`clinics.stage.${stage}`)}</span>
}

const HEALTH_CHIP: Record<HealthScore, string> = { green: 'chip-success', amber: 'chip-warning', red: 'chip-danger' }

export function HealthChip({ score }: { score: HealthScore }) {
  return <span className={HEALTH_CHIP[score]}>{t(`clinics.health.${score}`)}</span>
}

/** One-tap share. A plain link: no client JS, works on any phone with WhatsApp. */
export function WhatsAppButton({ text, phone, label, className = 'btn-whatsapp' }: { text: string; phone?: string | null; label?: string; className?: string }) {
  return (
    <a className={className} href={waLink(text, phone)} target="_blank" rel="noopener noreferrer">
      {label ?? t('common.shareWhatsApp')}
    </a>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="meta">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
