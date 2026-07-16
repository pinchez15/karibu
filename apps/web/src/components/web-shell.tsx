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
  Baby,
  HeartPulse,
  CreditCard,
  Database,
  BarChart3,
  Receipt,
  Package,
  UserPlus,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react'
import { KaribuLockup } from '@/components/karibu-mark'
import { SectionRail } from '@/components/section-rail'
import { activeWebShellUnitId } from '@/lib/web-shell-units'
import { cn } from '@/lib/utils'
import { CLINICAL_ROLES, DATA_REPORT_ROLES, BILLING_ROLES, ALL_STAFF_ROLES } from '@/lib/staff-roles'

// Legacy role type — kept exported so older imports don't break. The shell now
// derives the active *unit* from the path, not a role.
export type WebShellRole = 'clinician' | 'pharmacy' | 'lab' | 'analyst'

export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  count?: number | string
  amber?: boolean
}

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

/** Shared shortcuts on OPD and Inpatient sidebars — orders, tasks, stock, register. */
const CLINICAL_CROSS_LINKS: NavItem[] = [
  { id: 'patients', label: 'Patients', href: '/dashboard/visits', icon: Users },
  { id: 'worklists', label: 'Worklists', href: '/dashboard/worklists', icon: ListTodo },
  { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: ClipboardList },
  { id: 'stock', label: 'Stock', href: '/dashboard/stock-overview', icon: Package },
  { id: 'review', label: 'Review notes', href: '/dashboard/review', icon: ClipboardCheck, amber: true },
]

// Top-header units. Home (briefing dashboard + calendar) is shared; other units
// are role-scoped desks.
const UNITS: UnitDef[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    basePaths: ['/dashboard', '/dashboard/calendar'],
    roles: ALL_STAFF_ROLES,
    items: [
      { id: 'today', label: 'Today', href: '/dashboard', icon: Home },
      { id: 'calendar', label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    ],
  },
  {
    id: 'opd',
    label: 'OPD',
    icon: Stethoscope,
    basePaths: ['/dashboard/opd', '/dashboard/visits', '/dashboard/patients', '/dashboard/worklists', '/dashboard/orders', '/dashboard/review', '/dashboard/stock-overview', '/dashboard/consult', '/dashboard/referrals'],
    roles: CLINICAL_ROLES,
    items: [
      { id: 'opd-today', label: 'Today & queue', href: '/dashboard/opd', icon: Home },
      ...CLINICAL_CROSS_LINKS,
    ],
  },
  {
    id: 'inpatient',
    label: 'Inpatient',
    icon: BedDouble,
    basePaths: ['/dashboard/inpatient'],
    roles: CLINICAL_ROLES,
    items: [
      { id: 'ward-census', label: 'Ward census', href: '/dashboard/inpatient', icon: BedDouble },
      { id: 'admit', label: 'Admit patient', href: '/dashboard/inpatient/admit', icon: UserPlus },
      { id: 'handover', label: 'Handover', href: '/dashboard/inpatient/handover', icon: ArrowRightLeft },
      { id: 'anc-registry', label: 'ANC registry', href: '/dashboard/anc', icon: Baby },
      ...CLINICAL_CROSS_LINKS,
    ],
  },
  {
    id: 'anc',
    label: 'ANC',
    icon: Baby,
    basePaths: ['/dashboard/anc'],
    roles: CLINICAL_ROLES,
    items: [{ id: 'anc-registry', label: 'Registry', href: '/dashboard/anc', icon: Baby }],
  },
  {
    id: 'hiv-tb',
    label: 'HIV/TB',
    icon: HeartPulse,
    basePaths: ['/dashboard/hiv-tb'],
    roles: CLINICAL_ROLES,
    items: [{ id: 'hiv-tb-registry', label: 'Registers', href: '/dashboard/hiv-tb', icon: HeartPulse }],
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
    // Clinical officers (and admins, who see all units) dual-act as dispensers
    // when no pharmacist is on shift — see migration 093.
    roles: ['dispenser', 'clinical_officer'],
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
    roles: BILLING_ROLES,
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
    roles: DATA_REPORT_ROLES,
    items: [
      { id: 'data-overview', label: 'Register', href: '/dashboard/admin/reports', icon: Home },
      { id: 'data-hmis', label: 'HMIS 105', href: '/dashboard/admin/reports/hmis105', icon: ClipboardList },
      { id: 'data-hmis106a-hiv', label: 'HMIS 106a HIV', href: '/dashboard/admin/reports/hmis106a-hiv', icon: ClipboardList },
      { id: 'data-hmis106a-tb', label: 'HMIS 106a TB', href: '/dashboard/admin/reports/hmis106a-tb', icon: ClipboardList },
      { id: 'data-quality', label: 'Data quality', href: '/dashboard/admin/reports/data-quality', icon: Sparkles },
    ],
  },
]

function activeUnitId(pathname: string): string {
  return activeWebShellUnitId(pathname)
}

function canSeeUnit(unit: UnitDef, staffRole?: string): boolean {
  if (!staffRole) return unit.id === 'home'
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
      <header className="no-print sticky top-0 z-30 flex items-center border-b border-border bg-card pr-5 h-14 shrink-0">
        {/* Logo occupies the sidebar's width so the unit tabs begin at the
            content column's left edge, tracking the sidebar divider line. */}
        <Link
          href="/dashboard"
          aria-label="KaribuEHR — calendar home"
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
        {/* Every unit gets the collapsible icon rail so master/detail worksheets
            (dispense, lab worklist, chart) reclaim horizontal width on tablets.
            Collapsed by default; the choice persists app-wide. */}
        <SectionRail
          clinicName={clinicName}
          unitLabel={activeUnit?.label ?? 'Home'}
          items={items}
          pathname={pathname}
          counts={counts}
          staff={staff}
          showPatientSearch={currentUnitId === 'opd' || currentUnitId === 'inpatient'}
        />

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
export function isActive(pathname: string, href: string) {
  if (pathname === href) return true
  if (href === '/dashboard') return false
  if (href === '/dashboard/admin' && pathname.startsWith('/dashboard/admin/reports')) return false
  // OPD "Today" only on the list root — not visit detail or other OPD children.
  if (href === '/dashboard/opd' && pathname !== href) return false
  // Ward census only on the census list — not admit, handover, or admission chart.
  if (href === '/dashboard/inpatient' && pathname !== href) return false
  if ((href === '/dashboard/pharmacy' || href === '/dashboard/lab') && pathname !== href) return false
  // Billing Payments only on the list root — not patient bills or reports.
  if (href === '/dashboard/billing' && pathname.startsWith('/dashboard/billing/')) return false
  if (href === '/dashboard/admin/reports' && pathname.startsWith('/dashboard/admin/reports/')) return false
  return pathname.startsWith(href)
}
