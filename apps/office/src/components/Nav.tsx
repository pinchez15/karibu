'use client'

import { usePathname } from 'next/navigation'

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number }

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)
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
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[15px] font-medium ${
                active ? 'bg-cobalt-soft font-semibold text-cobalt-deep' : 'text-body hover:bg-line-soft'
              }`}
            >
              {item.label}
              {item.badge ? <span className="chip-danger">{item.badge}</span> : null}
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
              className={`flex min-h-[56px] flex-col items-center justify-center border-t-2 text-[13px] font-semibold active:bg-line-soft ${
                active ? 'border-cobalt text-cobalt' : 'border-transparent text-body'
              }`}
            >
              {item.label}
              {item.badge ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red" aria-label={String(item.badge)} /> : null}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
