/**
 * Unit routing for WebShell — which top-level desk owns a dashboard path.
 */

export interface WebShellUnitDef {
  id: string
  /** Path prefixes that activate this unit (longest match wins). */
  basePaths: string[]
}

export const WEB_SHELL_UNITS: WebShellUnitDef[] = [
  { id: 'home', basePaths: ['/dashboard', '/dashboard/calendar'] },
  {
    id: 'opd',
    basePaths: [
      '/dashboard/opd',
      '/dashboard/visits',
      '/dashboard/patients',
      '/dashboard/worklists',
      '/dashboard/orders',
      '/dashboard/review',
      '/dashboard/stock-overview',
      '/dashboard/consult',
      '/dashboard/referrals',
    ],
  },
  {
    id: 'inpatient',
    basePaths: ['/dashboard/inpatient'],
  },
  { id: 'anc', basePaths: ['/dashboard/anc'] },
  { id: 'hiv-tb', basePaths: ['/dashboard/hiv-tb'] },
  { id: 'lab', basePaths: ['/dashboard/lab', '/dashboard/my-labs'] },
  { id: 'pharmacy', basePaths: ['/dashboard/pharmacy', '/dashboard/my-pharmacy'] },
  { id: 'billing', basePaths: ['/dashboard/billing'] },
  { id: 'data', basePaths: ['/dashboard/admin/reports'] },
]

/** Which unit sidebar to show for a dashboard pathname. */
export function activeWebShellUnitId(pathname: string): string {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/calendar')) {
    return 'home'
  }

  let best: { id: string; len: number } | null = null
  for (const unit of WEB_SHELL_UNITS) {
    if (unit.id === 'home') continue
    for (const base of unit.basePaths) {
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        if (!best || base.length > best.len) {
          best = { id: unit.id, len: base.length }
        }
      }
    }
  }
  if (best) return best.id

  // Clinician chart surfaces without a tighter prefix.
  if (
    pathname.startsWith('/dashboard/patients') ||
    pathname.startsWith('/dashboard/visits') ||
    pathname.startsWith('/dashboard/consult') ||
    pathname.startsWith('/dashboard/referrals')
  ) {
    return 'opd'
  }

  return 'opd'
}
