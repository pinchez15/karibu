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
 * Karibu wordmark — uses the brand PNG asset (apps/web/public/karibu-wordmark.png)
 * so the cobalt rendering and kerning stay consistent across the site. The
 * source PNG is square (500×500) with the text centered; rendering at a
 * fixed height with `width: auto` lets it scale cleanly. Use a larger
 * height for the marketing pages and a smaller one for the dashboard
 * sidebar.
 */
export function KaribuWordmark({ height = 36, className }: KaribuWordmarkProps) {
  return (
    <img
      src="/karibu-wordmark.png"
      alt="Karibu.health"
      height={height}
      style={{ height, width: 'auto', display: 'inline-block' }}
      className={className}
    />
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
