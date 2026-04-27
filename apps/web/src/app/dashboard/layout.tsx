'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Stethoscope,
  ClipboardList,
  Settings,
  Menu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const navigation = [
  { name: "Today's Queue", href: '/dashboard', icon: Users },
  { name: 'Review', href: '/dashboard/review', icon: ClipboardList },
  { name: 'Patients', href: '/dashboard/visits', icon: Stethoscope },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const currentPage = navigation.find(
    n => pathname === n.href || (n.href !== '/dashboard' && pathname?.startsWith(n.href))
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logos/icon-only.svg" alt="" className="h-7 w-7" />
            <h1 className="text-lg font-semibold tracking-tight">
              {currentPage?.name || 'Karibu Health'}
            </h1>
          </div>

          {/* Hamburger menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="py-6 space-y-1">
                {navigation.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname?.startsWith(item.href))
                  return (
                    <Link key={item.name} href={item.href}>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        className="w-full justify-start h-12 gap-3"
                      >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                      </Button>
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
