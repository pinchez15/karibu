'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Users,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  Pill,
  FlaskConical,
  Sparkles,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'
import { KaribuLockup } from '@/components/karibu-mark'
import { SidebarAccountMenu } from '@/components/sidebar-account-menu'
import { cn } from '@/lib/utils'

export type WebShellRole = 'clinician' | 'pharmacy' | 'lab' | 'analyst'

interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Right-side count badge. Number for counts; string for status (e.g. "May"). */
  count?: number | string
  /** Highlight badge in amber (signals attention required). */
  amber?: boolean
}

/** Admin-only shortcuts to role-specific workstation queues. */
const ADMIN_WORKSTATIONS: NavItem[] = [
  { id: 'pharmacy-desk', label: 'Pharmacy desk', href: '/dashboard/pharmacy', icon: Pill },
  { id: 'lab-desk', label: 'Lab desk', href: '/dashboard/lab', icon: FlaskConical },
]

const NAV_BY_ROLE: Record<WebShellRole, NavItem[]> = {
  clinician: [
    { id: 'home', label: 'Today', href: '/dashboard', icon: Home },
    { id: 'patients', label: 'Patients', href: '/dashboard/visits', icon: Users },
    { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: ClipboardList },
    { id: 'worklists', label: 'Worklists', href: '/dashboard/worklists', icon: ListTodo },
    { id: 'review', label: 'Review queue', href: '/dashboard/review', icon: ClipboardCheck, amber: true },
    { id: 'reports', label: 'Reports', href: '/dashboard/admin/reports', icon: BarChart3 },
  ],
  pharmacy: [
    { id: 'orders', label: 'Today', href: '/dashboard/pharmacy', icon: Pill },
    { id: 'stock', label: 'Stock', href: '/dashboard/pharmacy/stock', icon: ListTodo },
    { id: 'history', label: 'History', href: '/dashboard/pharmacy/history', icon: Users },
  ],
  lab: [
    { id: 'orders', label: 'Today', href: '/dashboard/lab', icon: FlaskConical },
    { id: 'stock', label: 'Stock', href: '/dashboard/lab/stock', icon: ListTodo },
    { id: 'history', label: 'History', href: '/dashboard/lab/history', icon: Users },
  ],
  analyst: [
    { id: 'overview', label: 'Overview', href: '/dashboard/admin/reports', icon: Home },
    { id: 'hmis', label: 'HMIS 105', href: '/dashboard/admin/reports/hmis105', icon: ClipboardList },
    { id: 'quality', label: 'Data quality', href: '/dashboard/admin/reports/data-quality', icon: Sparkles, amber: true },
  ],
}

const ROLE_LABEL: Record<WebShellRole, string> = {
  clinician: 'Clinician',
  pharmacy: 'Pharmacy',
  lab: 'Laboratory',
  analyst: 'Analyst',
}

interface WebShellProps {
  role: WebShellRole
  /** Display name + role of the signed-in user, shown in the bottom-of-sidebar account cell. */
  staff?: { displayName: string; role: string; initials: string }
  /** Raw staff role from the staff table (lowercase, e.g. 'admin', 'doctor', 'lab_tech'). */
  staffRole?: string
  /** Clinic name shown in the sidebar header. */
  clinicName?: string
  /** Optional: override per-route counts (e.g. live review-queue count). */
  counts?: Partial<Record<string, number | string>>
  children: React.ReactNode
}

/**
 * Karibu Health desktop shell.
 *
 * Layout: 232-px sidebar (KaribuLockup + clinic switcher + role-aware nav + account)
 * + main content area on the right.
 *
 * Designed for desktop / clinic workstation use. The mobile clinician primarily
 * uses Android; web is for stationary input + analytics.
 */
export function WebShell({
  role,
  staff,
  staffRole,
  clinicName = 'Susunga HC III',
  counts,
  children,
}: WebShellProps) {
  const pathname = usePathname() || ''
  const fullNav = NAV_BY_ROLE[role]
  // Reports landing is admin-gated. For non-admin clinicians, the link silently
  // bounces back to /dashboard — better to just not show it.
  const nav = fullNav.filter((item) => {
    if (item.id === 'reports' && role === 'clinician' && staffRole !== 'admin') return false
    return true
  })

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-[232px] bg-card border-r border-border flex flex-col shrink-0">
        {/* Lockup + clinic switcher */}
        <div className="p-5 border-b border-line-soft">
          <KaribuLockup size={32} />
          <div className="mt-3 bg-background rounded-md px-2.5 py-2">
            <div className="kh-meta">CLINIC</div>
            <div className="text-[13px] font-semibold text-ink truncate">{clinicName}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-3.5 flex-1">
          <div className="kh-meta px-2 pb-2">{ROLE_LABEL[role].toUpperCase()}</div>
          {nav.map((item) => {
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
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    active ? 'text-cobalt' : 'text-muted-foreground',
                  )}
                />
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
                      typeof count === 'string' && count.length > 2 && 'font-mono',
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
          {role === 'clinician' && staffRole === 'admin' && (
            <>
              <div className="kh-meta px-2 pt-4 pb-2">WORKSTATIONS</div>
              {ADMIN_WORKSTATIONS.map((item) => {
                const active = isActive(pathname, item.href)
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
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0',
                        active ? 'text-cobalt' : 'text-muted-foreground',
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        {/* Account */}
        {staff && (
          <SidebarAccountMenu
            displayName={staff.displayName}
            role={staff.role}
            initials={staff.initials}
          />
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">{children}</main>
    </div>
  )
}

interface WebTopBarProps {
  title: string
  subtitle?: string
  /** When false, subtitle uses normal sentence case (e.g. clinic dates). Default: meta label style. */
  subtitleMeta?: boolean
  actions?: React.ReactNode
}

/**
 * Page header used inside WebShell — uppercase mono subtitle + large title.
 * Mirrors the pattern in karibu_design_files/web-clinician.jsx.
 */
export function WebTopBar({ title, subtitle, subtitleMeta = true, actions }: WebTopBarProps) {
  return (
    <div className="relative z-10 px-8 py-5 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
      <div className="min-w-0 flex-1">
        {subtitle && (
          <div
            className={cn(
              'mb-1',
              subtitleMeta
                ? 'kh-meta'
                : 'text-[13px] text-muted-foreground',
            )}
          >
            {subtitle}
          </div>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight truncate">{title}</h1>
      </div>
      {actions && (
        <div className="relative z-20 flex shrink-0 items-center gap-2.5">{actions}</div>
      )}
    </div>
  )
}

/** Active-route detection: exact match or prefix. /dashboard never wins by prefix. */
function isActive(pathname: string, href: string) {
  if (pathname === href) return true
  if (href === '/dashboard') return false
  return pathname.startsWith(href)
}
