/**
 * Karibu Health logo — cobalt rounded square with k+ in white.
 * SVG recreation of the original layout, sized via the `size` prop.
 * Lockup variants (Mark + Wordmark) below for sidebar / sign-in / receipt header.
 */

import { cn } from '@/lib/utils'

interface KaribuMarkProps {
  size?: number
  radius?: number
  /** Background fill — defaults to cobalt. Use 'currentColor' for monochrome inheritance. */
  color?: string
  /** Foreground (k+) color — defaults to white. */
  fg?: string
  className?: string
}

export function KaribuMark({
  size = 40,
  radius,
  color = 'rgb(31 54 199)', // cobalt
  fg = '#FFFFFF',
  className,
}: KaribuMarkProps) {
  const r = radius ?? Math.round(size * 0.22)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('shrink-0', className)}
      aria-label="Karibu Health"
    >
      <rect x="0" y="0" width="100" height="100" rx={r} fill={color} />
      {/* k */}
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      {/* + (small, top-right) */}
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  )
}

interface KaribuWordmarkProps {
  height?: number
  className?: string
}

/**
 * KaribuEHR wordmark. The product is now branded **KaribuEHR** (one word, the
 * EHR is part of the name, not a tagline). Rendered as text in the brand cobalt
 * so it stays crisp at any size and we don't ship a stale "Karibu.health" PNG.
 */
export function KaribuWordmark({ height = 36, className }: KaribuWordmarkProps) {
  return (
    <span
      aria-label="KaribuEHR"
      className={cn('font-semibold tracking-tight text-cobalt leading-none', className)}
      style={{ fontSize: Math.round(height * 0.7) }}
    >
      KaribuEHR
    </span>
  )
}

interface KaribuLockupProps {
  size?: number
  /** Mark background. Defaults to cobalt; pass 'transparent' or other for dark surfaces. */
  color?: string
  /**
   * Legacy prop kept for backwards-compat; the wordmark now renders from
   * the brand PNG so its color is fixed. Ignored.
   */
  textColor?: string
  className?: string
}

export function KaribuLockup({
  size = 36,
  color = 'rgb(31 54 199)',
  className,
}: KaribuLockupProps) {
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <KaribuMark size={size} color={color} />
      <KaribuWordmark height={Math.round(size * 0.9)} />
    </div>
  )
}
