import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ReportTileProps {
  tag: string
  title: string
  desc: string
  href: string
  /** [label, value, optional-color-class] — up to 2 stats shown beneath the chart. */
  stats?: Array<[string, string, string?]>
  /** Mini chart shown in the middle of the tile. */
  mini?: React.ReactNode
  /** Highlight the tile (amber border) when something needs attention. */
  hot?: boolean
  /** Workbench / "build a new report" variant — dashed border, gradient fill. */
  workbench?: boolean
}

/**
 * Tableau-style report tile. Tag (uppercase mono) + title + description +
 * mini chart + 1-2 stats. Tap to drill into the full report.
 */
export function ReportTile({
  tag,
  title,
  desc,
  href,
  stats,
  mini,
  hot,
  workbench,
}: ReportTileProps) {
  if (workbench) {
    return (
      <Link
        href={href}
        className="bg-gradient-to-br from-cobalt-soft to-card border border-dashed border-cobalt/30 rounded-xl p-[18px] flex flex-col justify-between hover:border-cobalt/60 transition-colors"
      >
        <div>
          <div className="kh-meta text-cobalt mb-2">{tag}</div>
          <div className="text-[17px] font-bold text-cobalt tracking-tight">{title}</div>
          <div className="text-xs text-body mt-1.5">{desc}</div>
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <span className="inline-flex w-8 h-8 rounded-md bg-cobalt text-white items-center justify-center text-lg font-semibold">
            +
          </span>
          <span className="text-[13px] text-cobalt font-semibold">Start a new report →</span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        'bg-card border rounded-xl p-[18px] flex flex-col gap-3 transition-colors',
        hot ? 'border-amber/60 hover:border-amber' : 'border-border hover:border-cobalt/40',
      )}
    >
      <div>
        <div className={cn('kh-meta mb-1.5', hot ? 'text-amber' : 'text-muted-foreground')}>{tag}</div>
        <div className="text-[17px] font-bold tracking-tight">{title}</div>
        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</div>
      </div>
      {mini}
      {stats && stats.length > 0 && (
        <div className="flex gap-3.5 pt-1 border-t border-line-soft">
          {stats.map(([label, value, colorClass]) => (
            <div key={label}>
              <div className="kh-meta">{label.toUpperCase()}</div>
              <div className={cn('text-sm font-bold font-mono', colorClass ?? 'text-ink')}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}
