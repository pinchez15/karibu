import type { CSSProperties } from 'react'

type KMarkProps = {
  size?: number
  color?: string
  fg?: string
  radius?: number
  className?: string
  style?: CSSProperties
}

export function KMark({
  size = 40,
  color = 'rgb(var(--kh-cobalt))',
  fg = '#FFFFFF',
  radius,
  className,
  style,
}: KMarkProps) {
  const r = radius ?? Math.round(size * 0.22)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="100" height="100" rx={r} fill={color} />
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  )
}

type KWordmarkProps = {
  height?: number
  color?: string
  suffix?: string
  suffixColor?: string
  weight?: number
  className?: string
}

export function KWordmark({
  height = 22,
  color,
  suffix = '.health',
  suffixColor,
  weight = 700,
  className,
}: KWordmarkProps) {
  return (
    <span
      className={`inline-flex items-baseline whitespace-nowrap leading-none tracking-[-0.03em] ${className ?? ''}`}
      style={{ fontSize: height, fontWeight: weight, color }}
    >
      <span>Karibu</span>
      <span
        style={{
          fontWeight: 500,
          color: suffixColor || 'currentColor',
          opacity: suffixColor ? 1 : 0.6,
        }}
      >
        {suffix}
      </span>
    </span>
  )
}

type KLockupProps = {
  size?: number
  markColor?: string
  markFg?: string
  textColor?: string
  suffix?: string
  suffixColor?: string
  gap?: number
  className?: string
}

export function KLockup({
  size = 32,
  markColor = 'rgb(var(--kh-cobalt))',
  markFg = '#FFFFFF',
  textColor,
  suffix = '.health',
  suffixColor,
  gap = 10,
  className,
}: KLockupProps) {
  return (
    <span className={`inline-flex items-center ${className ?? ''}`} style={{ gap }}>
      <KMark size={size} color={markColor} fg={markFg} />
      <KWordmark
        height={Math.round(size * 0.62)}
        color={textColor}
        suffix={suffix}
        suffixColor={suffixColor}
      />
    </span>
  )
}
