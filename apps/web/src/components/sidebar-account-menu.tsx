'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { Bell, ChevronUp, LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarAccountMenuProps {
  displayName: string
  role: string
  initials: string
  /** Icon-rail mode (pharmacy collapsed): avatar-only trigger, popup gets a fixed width. */
  compact?: boolean
}

export function SidebarAccountMenu({ displayName, role, initials, compact = false }: SidebarAccountMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div
      ref={rootRef}
      className={cn(
        'border-t border-line-soft relative',
        compact ? 'p-2 flex justify-center' : 'p-3.5',
      )}
    >
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-2 bg-card border border-border rounded-lg shadow-lg py-1 z-20',
            compact ? 'left-2 w-48' : 'left-3 right-3',
          )}
          role="menu"
        >
          <Link
            href="/dashboard/settings"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-body hover:bg-background"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Account settings
          </Link>
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </SignOutButton>
        </div>
      )}

      {compact ? (
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-background/80"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${displayName} — account menu`}
          title={displayName}
        >
          <div className="w-8 h-8 rounded-full bg-cobalt-soft text-cobalt flex items-center justify-center font-semibold text-xs shrink-0">
            {initials}
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="flex flex-1 min-w-0 items-center gap-2.5 text-left rounded-md hover:bg-background/80 px-1 py-0.5 -mx-1"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <div className="w-8 h-8 rounded-full bg-cobalt-soft text-cobalt flex items-center justify-center font-semibold text-xs shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{displayName}</div>
              <div className="text-[11px] text-muted-foreground truncate">{role}</div>
            </div>
            <ChevronUp
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-ink shrink-0 p-1"
            aria-label="Notifications"
            title="Notifications coming soon"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
