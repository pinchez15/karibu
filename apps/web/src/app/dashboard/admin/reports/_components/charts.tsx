/**
 * Inline chart primitives for the analyst surfaces.
 * No external chart library — these render as plain SVG / divs and are
 * intentionally tiny so they can sit inside KPI cards and report tiles.
 */

import { cn } from '@/lib/utils'

interface SparkProps {
  values: number[]
  color?: string
  height?: number
  className?: string
}

/** Inline sparkline. Use for "trend over time" inside small KPI cards. */
export function Spark({ values, color = 'rgb(31 54 199)', height = 36, className }: SparkProps) {
  if (values.length === 0) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const points = values
    .map((v, i) => `${i * 10},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ')

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${values.length * 10} ${height}`}
      preserveAspectRatio="none"
      className={cn('block', className)}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

interface BarsProps {
  values: number[]
  color?: string
  height?: number
  className?: string
}

/** Inline column bars. Lightweight alternative to a full chart library. */
export function Bars({ values, color = 'rgb(31 54 199)', height = 80, className }: BarsProps) {
  if (values.length === 0) return null
  const max = Math.max(...values)
  return (
    <div
      className={cn('flex items-end gap-[3px]', className)}
      style={{ height }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${(v / max) * 100}%`,
            background: color,
            opacity: 0.4 + (v / max) * 0.6,
          }}
        />
      ))}
    </div>
  )
}
