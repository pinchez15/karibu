// Line icons, one path each, drawn inline so there is no icon font or sprite to download.
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  leads: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  pipeline: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  onboarding: 'M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  clinics: 'M4 21V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v15M2 21h20M12 8v6M9 11h6M10 21v-4h4v4',
  support: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4',
  cashflow: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  analytics: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  guide: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M8 7l4-4 4 4',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  foundation: 'M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-6 10 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 5l12 7-12 7z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ''}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
