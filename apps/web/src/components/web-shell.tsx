'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Users,
  ClipboardList,
  ClipboardCheck,
  Calendar,
  Pill,
  FlaskConical,
  Sparkles,
  ListTodo,
  Settings,
  Stethoscope,
  BedDouble,
  CreditCard,
  Database,
  BarChart3,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { KaribuLockup } from '@/components/karibu-mark'
import { SidebarAccountMenu } from '@/components/sidebar-account-menu'
import { cn } from '@/lib/utils'

// Legacy role type — kept exported so older imports don't break. The shell now
// derives the active *unit* from the path, not a role.
export type WebShellRole = 'clinician' | 'pharmacy' | 'lab' | 'analyst'

interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  count?: number | string
  amber?: boolean
}

// Clinical roles share OPD/Inpatient. Lab/pharmacy desks are role-scoped.
const CLINICAL = [
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
]

/** Every clinic staff role that can record patient payments at the front desk. */
const BILLING_STAFF = [
  ...CLINICAL,
  'lab_tech',
  'dispenser',
]

interface UnitDef {
  id: string
  label: string
  icon: LucideIcon
  /** Path prefixes that activate this unit (most-specific units matched first). */
  basePaths: string[]
  /** staff roles (lowercase) that can see this unit; admin always can. */
  roles: string[]
  /** Sidebar sub-nav for this unit. */
  items: NavItem[]
}

// Top-header units. "Today" is global (the logo returns to it) and is not a
// unit. OPD is the catch-all unit for the core clinician routes.
const UNITS: UnitDef[] = [
  {
    id: 'opd',
    label: 'OPD',
    icon: Stethoscope,
    basePaths: ['/dashboard/visits', '/dashboard/worklists', '/dashboard/orders', '/dashboard/review', '/dashboard/calendar'],
    roles: CLINICAL,
    items: [
      { id: 'today', label: 'Today', href: '/dashboard', icon: Home },
      { id: 'calendar', label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
      { id: 'patients', label: 'Patients', href: '/dashboard/visits', icon: Users },
      { id: 'worklists', label: 'Worklists', href: '/dashboard/worklists', icon: ListTodo },
      { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: ClipboardList },
      { id: 'review', label: 'Review Notes', href: '/dashboard/review', icon: ClipboardCheck, amber: true },
    ],
  },
  {
    id: 'inpatient',
    label: 'Inpatient',
    icon: BedDouble,
    basePaths: ['/dashboard/inpatient', '/dashboard/inpatient/admit'],
    roles: CLINICAL,
    items: [{ id: 'admissions', label: 'Admissions', href: '/dashboard/inpatient', icon: BedDouble }],
  },
  {
    id: 'lab',
    label: 'Lab',
    icon: FlaskConical,
    basePaths: ['/dashboard/lab'],
    roles: ['lab_tech'],
    items: [
      { id: 'lab-today', label: 'Today', href: '/dashboard/lab', icon: FlaskConical },
      { id: 'lab-stock', label: 'Stock', href: '/dashboard/lab/stock', icon: ListTodo },
      { id: 'lab-history', label: 'History', href: '/dashboard/lab/history', icon: ClipboardList },
    ],
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    icon: Pill,
    basePaths: ['/dashboard/pharmacy'],
    roles: ['dispenser'],
    items: [
      { id: 'rx-today', label: 'Dispensing', href: '/dashboard/pharmacy', icon: Pill },
      { id: 'rx-stock', label: 'Stock', href: '/dashboard/pharmacy/stock', icon: ListTodo },
      { id: 'rx-history', label: 'History', href: '/dashboard/pharmacy/history', icon: ClipboardList },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: CreditCard,
    basePaths: ['/dashboard/billing'],
    roles: BILLING_STAFF,
    items: [
      { id: 'billing-payments', label: 'Payments', href: '/dashboard/billing', icon: Receipt },
      { id: 'billing-reports', label: 'Reports', href: '/dashboard/billing/reports', icon: BarChart3 },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    icon: Database,
    basePaths: ['/dashboard/admin/reports'],
    roles: [],
    items: [
      { id: 'data-overview', label: 'Overview', href: '/dashboard/admin/reports', icon: Home },
      { id: 'data-hmis', label: 'HMIS 105', href: '/dashboard/admin/reports/hmis105', icon: ClipboardList },
      { id: 'data-quality', label: 'Data quality', href: '/dashboard/admin/reports/data-quality', icon: Sparkles },
    ],
  },
]

function activeUnitId(pathname: string): string {
  for (const unit of UNITS) {
    if (unit.basePaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return unit.id
    }
  }
  // Bare /dashboard (Today) and anything else falls under OPD.
  return 'opd'
}

function canSeeUnit(unit: UnitDef, staffRole?: string): boolean {
  if (!staffRole) return unit.id === 'opd'
  if (staffRole === 'admin') return true
  return unit.roles.includes(staffRole)
}

interface WebShellProps {
  /** @deprecated unit is now derived from the path; kept for call-site compat. */
  role?: WebShellRole
  staff?: { displayName: string; role: string; initials: string }
  /** Raw staff role from the staff table (lowercase, e.g. 'admin', 'doctor', 'lab_tech'). */
  staffRole?: string
  clinicName?: string
  counts?: Partial<Record<string, number | string>>
  children: React.ReactNode
}

/**
 * KaribuEHR desktop shell.
 *
 * Two-level navigation: a sticky top header of clinic *units* (OPD, Inpatient,
 * Lab, Pharmacy, Billing, Data) reachable from anywhere, and a sidebar that
 * shows the sub-nav for the active unit. The KaribuEHR logo always returns to
 * Today (/dashboard).
 */
export function WebShell({ staff, staffRole, clinicName = 'Ssunga HC III', counts, children }: WebShellProps) {
  const pathname = usePathname() || ''
  const currentUnitId = activeUnitId(pathname)

  const visibleUnits = UNITS.filter((u) => canSeeUnit(u, staffRole))
  const activeUnit = visibleUnits.find((u) => u.id === currentUnitId) ?? visibleUnits[0]
  const isAdmin = staffRole === 'admin'
  const items = (activeUnit?.items ?? []).filter(
    (item) => item.id !== 'billing-reports' || isAdmin,
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header — logo (→ Today) + unit tabs, sticky across every page */}
      <header className="sticky top-0 z-30 flex items-center border-b border-border bg-card pr-5 h-14 shrink-0">
        {/* Logo occupies the sidebar's width so the unit tabs begin at the
            content column's left edge, tracking the sidebar divider line. */}
        <Link
          href="/dashboard"
          aria-label="KaribuEHR — go to Today"
          className="flex w-[208px] shrink-0 items-center px-4"
        >
          <KaribuLockup size={28} />
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {visibleUnits.map((unit) => {
            const active = unit.id === currentUnitId
            const Icon = unit.icon
            const target = unit.items[0]?.href ?? '/dashboard'
            return (
              <Link
                key={unit.id}
                href={target}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-cobalt-soft text-cobalt' : 'text-body hover:bg-background',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {unit.label}
              </Link>
            )
          })}
        </nav>
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              pathname === '/dashboard/admin' ? 'bg-cobalt-soft text-cobalt' : 'text-body hover:bg-background',
            )}
          >
            <Settings className="h-4 w-4" />
            Admin
          </Link>
        )}
      </header>

      {/* Body — unit sidebar + content */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-[208px] bg-card border-r border-border flex flex-col shrink-0">
          <div className="p-4 border-b border-line-soft">
            <div className="kh-meta">CLINIC</div>
            <div className="text-[13px] font-semibold text-ink truncate">{clinicName}</div>
            {activeUnit && (
              <div className="kh-meta mt-3 text-cobalt">{activeUnit.label.toUpperCase()}</div>
            )}
          </div>

          <nav className="px-3 py-3 flex-1 overflow-y-auto">
            {items.map((item) => {
              const active = isActive(pathname, item.href)
              const count = counts?.[item.id] ?? item.count
              const Icon = item.icon
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] mb-0.5 transition-colors',
                    active
                      ? 'bg-cobalt-soft text-cobalt font-semibold'
                      : 'text-body hover:bg-background font-medium',
                  )}
                >
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-cobalt' : 'text-muted-foreground')} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count !== undefined && (
                    <span
                      className={cn(
                        'text-[11px] font-semibold px-1.5 py-px rounded-full',
                        item.amber
                          ? 'bg-amber-soft text-amber-ink'
                          : active
                            ? 'bg-white text-cobalt'
                            : 'bg-background text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {staff && (
            <SidebarAccountMenu displayName={staff.displayName} role={staff.role} initials={staff.initials} />
          )}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">{children}</main>
      </div>
    </div>
  )
}

interface WebTopBarProps {
  title: string
  subtitle?: string
  subtitleMeta?: boolean
  actions?: React.ReactNode
}

/**
 * Page header used inside WebShell — uppercase mono subtitle + large title.
 */
export function WebTopBar({ title, subtitle, subtitleMeta = true, actions }: WebTopBarProps) {
  return (
    <div className="relative z-10 px-8 py-5 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
      <div className="min-w-0 flex-1">
        {subtitle && (
          <div className={cn('mb-1', subtitleMeta ? 'kh-meta' : 'text-[13px] text-muted-foreground')}>
            {subtitle}
          </div>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight truncate">{title}</h1>
      </div>
      {actions && <div className="relative z-20 flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  )
}

/** Active-route detection: exact match or prefix. /dashboard never wins by prefix. */
function isActive(pathname: string, href: string) {
  if (pathname === href) return true
  if (href === '/dashboard') return false
  if (href === '/dashboard/admin' && pathname.startsWith('/dashboard/admin/reports')) return false
  // Pharmacy/lab "Today" roots shouldn't stay lit on their stock/history children.
  if ((href === '/dashboard/pharmacy' || href === '/dashboard/lab') && pathname !== href) return false
  // Billing Payments only on the list root — not patient bills or reports.
  if (href === '/dashboard/billing' && pathname.startsWith('/dashboard/billing/')) return false
  if (href === '/dashboard/admin/reports' && pathname.startsWith('/dashboard/admin/reports/')) return false
  return pathname.startsWith(href)
}
