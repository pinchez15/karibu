'use client'

import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './icons'

export type NavItem = {
  href: string
  label: string
  icon: IconName
  exact?: boolean
  /** A count beside the label. */
  badge?: number
  /** True when the count is something waiting on the partner, not just a size. */
  urgent?: boolean
  /** Other paths that should light this item up. */
  also?: string[]
  /** Paths under href that belong to another item. */
  except?: string[]
}

function isActive(path: string, item: NavItem) {
  if (item.exact) return path === item.href
  if (item.except?.some((p) => path === p || path.startsWith(`${p}/`))) return false
  const roots = [item.href, ...(item.also ?? [])]
  return roots.some((root) => path === root || path.startsWith(`${root}/`))
}

/** Desktop sidebar links. A client component only so the current page can be marked. */
export function SideLinks({ items }: { items: NavItem[] }) {
  const path = usePathname()
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(path, item)
        return (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[36px] items-center gap-2.5 rounded-full px-3 text-sm ${
                active ? 'bg-coral-soft font-semibold text-coral-ink' : 'font-medium text-body hover:bg-line-soft'
              }`}
            >
              <Icon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className={`num rounded-full px-1.5 text-xs font-semibold ${item.urgent ? 'bg-amber-soft text-amber-ink' : active ? 'text-coral-ink' : 'text-muted'}`}>
                  {item.badge}
                </span>
              ) : null}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/** Phone bottom tabs. */
export function TabLinks({ items }: { items: NavItem[] }) {
  const path = usePathname()
  return (
    <ul className="mx-auto flex max-w-2xl">
      {items.map((item) => {
        const active = isActive(path, item)
        return (
          <li key={item.href} className="flex-1">
            <a
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:bg-line-soft ${
                active ? 'text-coral' : 'text-muted'
              }`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.badge && item.urgent ? (
                <span className="absolute right-[calc(50%-18px)] top-2 h-2 w-2 rounded-full bg-amber" aria-label={String(item.badge)} />
              ) : null}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
