/**
 * Large number for the clinic register — what staff write on paper each day.
 */
import type { ReactNode } from 'react'

export function RegisterMetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'cobalt' | 'green' | 'slate'
}) {
  const accentClass =
    accent === 'green'
      ? 'text-green'
      : accent === 'slate'
        ? 'text-slate'
        : 'text-cobalt'

  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <div className="kh-meta truncate">{label}</div>
      <div className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${accentClass}`}>
        {value}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{hint}</p>}
    </div>
  )
}

export function RegisterSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}
