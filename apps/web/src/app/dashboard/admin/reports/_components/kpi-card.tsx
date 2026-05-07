import { Spark } from './charts'

interface KpiCardProps {
  label: string
  value: string
  delta?: string
  /** When true, delta renders in green (positive). Otherwise muted. */
  positive?: boolean
  /** Sparkline values (optional). */
  trend?: number[]
  trendColor?: string
}

/**
 * Headline metric card — used at the top of the analyst overview and
 * on the clinician dashboard. Tight spacing, mono delta chip, optional
 * sparkline.
 */
export function KpiCard({
  label,
  value,
  delta,
  positive,
  trend,
  trendColor,
}: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="kh-meta">{label}</div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-[22px] font-bold tracking-tight">{value}</span>
        {delta && (
          <span
            className={`text-[11px] font-mono font-semibold ${
              positive ? 'text-green' : 'text-muted-foreground'
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      {trend && trend.length > 0 && (
        <div className="mt-2">
          <Spark values={trend} color={trendColor} height={32} />
        </div>
      )}
    </div>
  )
}
