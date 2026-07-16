'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { SidebarAccountMenu } from '@/components/sidebar-account-menu'
import { SidebarPatientSearch } from '@/components/sidebar-patient-search'
import { isActive, type NavItem } from '@/components/web-shell'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'karibu.sectionRailCollapsed'

interface StaffSummary {
  displayName: string
  role: string
  initials: string
}

interface SectionRailProps {
  clinicName: string
  unitLabel: string
  items: NavItem[]
  pathname: string
  counts?: Partial<Record<string, number | string>>
  staff?: StaffSummary
  /** Show the patient search affordance for this unit (search box expanded, icon collapsed). */
  showPatientSearch?: boolean
}

/**
 * The shared section sidebar for every WebShell unit (OPD, Inpatient, ANC,
 * HIV/TB, Lab, Billing, Data, Pharmacy) as a collapsible icon rail.
 *
 * On an 8×11 tablet a fixed-width sub-nav steals horizontal width from the
 * master/detail worksheets (dispense, lab worklist, chart). Collapsed by
 * default, each item shows only its icon with an accessible tooltip (hover,
 * keyboard focus, and long-press for touch). The expand/collapse choice
 * persists app-wide in localStorage. When collapsed the rail shrinks to a
 * 64px icon column and the `flex-1` main content reclaims the freed width.
 *
 * Units that carry a patient search (`showPatientSearch`) keep it reachable in
 * both states: an expanded search box, or a collapsed search icon that expands
 * the rail and focuses the input — the search is never silently dropped.
 */
export function SectionRail({
  clinicName,
  unitLabel,
  items,
  pathname,
  counts,
  staff,
  showPatientSearch = false,
}: SectionRailProps) {
  // Collapsed by default (spec). Hydrate the persisted preference after mount so
  // the initial server/client render agree, then reconcile with localStorage.
  const [collapsed, setCollapsed] = useState(true)
  // When the collapsed search icon expands the rail, focus the search input.
  const [focusSearch, setFocusSearch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored != null) setCollapsed(stored === '1')
    } catch {
      // localStorage can throw in private mode / sandboxed iframes — ignore.
    }
  }, [])

  const persist = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore persistence failures
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      persist(next)
      return next
    })
  }, [persist])

  // Search icon (collapsed): expand the rail and focus the search box so the
  // patient search stays a single tap away on tablets.
  const expandForSearch = useCallback(() => {
    setCollapsed(false)
    persist(false)
    setFocusSearch(true)
  }, [persist])

  return (
    <aside
      className={cn(
        'no-print bg-card border-r border-border flex flex-col shrink-0 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[208px]',
      )}
      aria-label={`${unitLabel} section navigation`}
    >
      {/* Header — clinic identity + collapse toggle */}
      {collapsed ? (
        <div className="p-2 border-b border-line-soft flex justify-center">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={false}
            aria-label={`Expand ${unitLabel.toLowerCase()} navigation`}
            title={`Expand ${unitLabel.toLowerCase()} navigation`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-cobalt hover:bg-background"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="p-4 border-b border-line-soft">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="kh-meta">CLINIC</div>
              <div className="text-[13px] font-semibold text-ink truncate">{clinicName}</div>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={true}
              aria-label={`Collapse ${unitLabel.toLowerCase()} navigation`}
              title={`Collapse ${unitLabel.toLowerCase()} navigation`}
              className="shrink-0 flex h-11 w-11 -mr-2 -mt-1 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-cobalt"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="kh-meta mt-3 text-cobalt">{unitLabel.toUpperCase()}</div>
        </div>
      )}

      {/* Patient search — never silently dropped. Expanded: a search box.
          Collapsed: an icon that expands the rail and focuses the box. */}
      {showPatientSearch &&
        (collapsed ? (
          <div className="p-2 border-b border-line-soft flex justify-center">
            <button
              type="button"
              onClick={expandForSearch}
              aria-label="Search patients"
              title="Search patients"
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-body"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          </div>
        ) : (
          <div className="px-3 pt-3 pb-2 border-b border-line-soft">
            <SidebarPatientSearch
              autoFocus={focusSearch}
              onFocusHandled={() => setFocusSearch(false)}
            />
          </div>
        ))}

      {/* Section nav */}
      <nav
        className={cn('py-3 flex-1 overflow-y-auto', collapsed ? 'px-2' : 'px-3')}
        aria-label={`${unitLabel} sections`}
      >
        {collapsed ? (
          <ul className="flex flex-col items-center gap-1">
            {items.map((item) => (
              <RailIconItem
                key={item.id}
                item={item}
                active={isActive(pathname, item.href)}
                count={counts?.[item.id] ?? item.count}
              />
            ))}
          </ul>
        ) : (
          items.map((item) => {
            const active = isActive(pathname, item.href)
            const count = counts?.[item.id] ?? item.count
            const Icon = item.icon
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 min-h-[44px] rounded-md text-[13px] mb-0.5 transition-colors',
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
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            )
          })
        )}
      </nav>

      {staff && (
        <SidebarAccountMenu
          displayName={staff.displayName}
          role={staff.role}
          initials={staff.initials}
          compact={collapsed}
        />
      )}
    </aside>
  )
}

interface RailIconItemProps {
  item: NavItem
  active: boolean
  count?: number | string
}

/**
 * A single icon-only nav entry with an accessible tooltip. The label is exposed
 * to assistive tech via `aria-label` (the tooltip is never the only affordance)
 * and revealed visually on hover, keyboard focus, and touch long-press — tablets
 * have no hover, so long-press matters.
 */
function RailIconItem({ item, active, count }: RailIconItemProps) {
  const [showTip, setShowTip] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const Icon = item.icon
  const label = count !== undefined ? `${item.label} (${count})` : item.label

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <li className="relative w-full flex justify-center">
      <Link
        href={item.href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        aria-describedby={`rail-tip-${item.id}`}
        title={item.label}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors',
          active
            ? 'bg-cobalt-soft text-cobalt'
            : 'text-muted-foreground hover:bg-background hover:text-body',
        )}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        onTouchStart={() => {
          longPressed.current = false
          clearTimer()
          longPressTimer.current = setTimeout(() => {
            longPressed.current = true
            setShowTip(true)
          }, 400)
        }}
        onTouchMove={clearTimer}
        onTouchEnd={(event) => {
          clearTimer()
          if (longPressed.current) {
            // Long-press reveals the label rather than navigating.
            event.preventDefault()
            setTimeout(() => setShowTip(false), 1500)
          }
        }}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {count !== undefined && (
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-semibold leading-none',
              item.amber ? 'bg-amber-soft text-amber-ink' : 'bg-cobalt text-white',
            )}
          >
            {count}
          </span>
        )}
      </Link>
      <span
        id={`rail-tip-${item.id}`}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-40 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-white shadow-lg transition-opacity',
          showTip ? 'opacity-100' : 'opacity-0',
        )}
      >
        {label}
      </span>
    </li>
  )
}
