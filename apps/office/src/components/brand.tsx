// Karibu mark, same geometry as apps/web/src/components/landing/brand.tsx.
export function KMark({ size = 32, color = 'rgb(var(--ko-coral-bright))', fg = '#FFFFFF' }: { size?: number; color?: string; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="22" fill={color} />
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  )
}

export function Lockup({ sub }: { sub?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <KMark size={30} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-semibold text-ink">Karibu Office</span>
        {sub ? <span className="block truncate text-xs text-muted">{sub}</span> : null}
      </span>
    </span>
  )
}
