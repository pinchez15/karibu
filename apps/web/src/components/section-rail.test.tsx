import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { Pill, ListTodo, ClipboardList, Home, Users } from 'lucide-react'
import { SectionRail } from './section-rail'

// next/link renders a plain anchor in jsdom already, but stub to be explicit.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href as string} {...rest}>
      {children}
    </a>
  ),
}))

// SidebarPatientSearch calls useRouter(); stub next/navigation.
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

// The account menu pulls in Clerk's <SignOutButton>; stub the whole module.
vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const STORAGE_KEY = 'karibu.sectionRailCollapsed'

const ITEMS = [
  { id: 'rx-today', label: 'Dispensing', href: '/dashboard/pharmacy', icon: Pill },
  { id: 'rx-stock', label: 'Stock', href: '/dashboard/pharmacy/stock', icon: ListTodo },
  { id: 'rx-history', label: 'History', href: '/dashboard/pharmacy/history', icon: ClipboardList },
]

function renderRail(props?: Partial<React.ComponentProps<typeof SectionRail>>) {
  return render(
    <SectionRail
      clinicName="Ssunga HC III"
      unitLabel="Pharmacy"
      items={ITEMS}
      pathname="/dashboard/pharmacy"
      counts={{ 'rx-today': 4 }}
      staff={{ displayName: 'Javis N', role: 'Dispenser', initials: 'JN' }}
      {...props}
    />,
  )
}

describe('SectionRail', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it('renders collapsed by default: every item is an accessible icon link and the clinic name is hidden', () => {
    renderRail()

    // Icon rail: each nav item is reachable by its accessible name.
    for (const label of ['Dispensing', 'Stock', 'History']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
    // Count is folded into the Dispensing item's accessible name.
    expect(screen.getByRole('link', { name: /Dispensing \(4\)/ })).toBeInTheDocument()

    // Tooltip content exists for each item (not the only affordance — aria-label above).
    const tips = screen.getAllByRole('tooltip')
    expect(tips.map((t) => t.textContent)).toEqual(
      expect.arrayContaining(['Dispensing (4)', 'Stock', 'History']),
    )

    // Collapsed → clinic name not shown; expand affordance present.
    expect(screen.queryByText('Ssunga HC III')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Expand pharmacy navigation/ })).toBeInTheDocument()
  })

  it('every icon touch target is at least 44px', () => {
    renderRail()
    for (const label of ['Dispensing', 'Stock', 'History']) {
      const link = screen.getByRole('link', { name: new RegExp(label) })
      expect(link.className).toMatch(/\bh-11\b/)
      expect(link.className).toMatch(/\bw-11\b/)
    }
  })

  it('narrows the rail when collapsed and widens it when expanded (content reclaims width)', () => {
    renderRail()
    // Collapsed → 64px icon column.
    const railCollapsed = screen.getByRole('complementary', { name: /section navigation/ })
    expect(railCollapsed.className).toMatch(/\bw-16\b/)
    expect(railCollapsed.className).not.toMatch(/w-\[208px\]/)

    fireEvent.click(screen.getByRole('button', { name: /Expand pharmacy navigation/ }))
    const railExpanded = screen.getByRole('complementary', { name: /section navigation/ })
    expect(railExpanded.className).toMatch(/w-\[208px\]/)
    expect(railExpanded.className).not.toMatch(/\bw-16\b/)
  })

  it('marks the active route with aria-current', () => {
    renderRail({ pathname: '/dashboard/pharmacy/stock' })
    expect(screen.getByRole('link', { name: /Stock/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Dispensing/ })).not.toHaveAttribute('aria-current')
  })

  it('expands on toggle: full text labels appear and the clinic name is shown', () => {
    renderRail()
    fireEvent.click(screen.getByRole('button', { name: /Expand pharmacy navigation/ }))

    expect(screen.getByText('Ssunga HC III')).toBeInTheDocument()
    // Expanded links show the label as visible text.
    const dispensing = screen.getByRole('link', { name: /Dispensing/ })
    expect(within(dispensing).getByText('Dispensing')).toBeInTheDocument()
    // Collapse affordance now available.
    expect(screen.getByRole('button', { name: /Collapse pharmacy navigation/ })).toBeInTheDocument()
  })

  it('persists the expanded preference to a generic (non-pharmacy) localStorage key and rehydrates it', () => {
    const first = renderRail()
    fireEvent.click(screen.getByRole('button', { name: /Expand pharmacy navigation/ }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0')
    first.unmount()
    cleanup()

    // A fresh mount reads the persisted "expanded" preference.
    renderRail()
    expect(screen.getByText('Ssunga HC III')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Collapse pharmacy navigation/ })).toBeInTheDocument()
  })

  it('persists the collapsed preference after collapsing an expanded rail', () => {
    window.localStorage.setItem(STORAGE_KEY, '0')
    renderRail()
    // Starts expanded from storage.
    expect(screen.getByRole('button', { name: /Collapse pharmacy navigation/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Collapse pharmacy navigation/ }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
  })

  it('reveals the tooltip on long-press for touch devices', () => {
    vi.useFakeTimers()
    try {
      renderRail()
      const stock = screen.getByRole('link', { name: /^Stock/ })
      const tip = document.getElementById('rail-tip-rx-stock')!
      expect(tip.className).toMatch(/opacity-0/)

      fireEvent.touchStart(stock)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(tip.className).toMatch(/opacity-100/)
    } finally {
      vi.useRealTimers()
    }
  })

  // --- Non-pharmacy regression coverage -------------------------------------
  //
  // The rail replaced the old shared <aside> that every clinical desk used.
  // These prove OPD keeps its patient search AND account menu in both states,
  // so generalizing the rail did not silently drop either affordance.

  const OPD_ITEMS = [
    { id: 'opd-today', label: 'Today & queue', href: '/dashboard/opd', icon: Home },
    { id: 'patients', label: 'Patients', href: '/dashboard/visits', icon: Users },
  ]

  function renderOpd(props?: Partial<React.ComponentProps<typeof SectionRail>>) {
    return render(
      <SectionRail
        clinicName="Ssunga HC III"
        unitLabel="OPD"
        items={OPD_ITEMS}
        pathname="/dashboard/opd"
        staff={{ displayName: 'Dr Amina', role: 'Doctor', initials: 'DA' }}
        showPatientSearch
        {...props}
      />,
    )
  }

  it('OPD collapsed: patient search stays reachable via a search icon that expands the rail into a focused search box', () => {
    renderOpd()
    // Collapsed: the search box itself is not rendered, but a search icon is.
    expect(screen.queryByRole('searchbox', { name: /Search patients/ })).not.toBeInTheDocument()
    const searchIcon = screen.getByRole('button', { name: /Search patients/ })
    expect(searchIcon.className).toMatch(/\bh-11\b/)

    // Tapping the icon expands the rail and surfaces the actual search box.
    fireEvent.click(searchIcon)
    const box = screen.getByRole('searchbox', { name: /Search patients/ })
    expect(box).toBeInTheDocument()
    // Rail is now expanded (clinic name visible) and the box is focused.
    expect(screen.getByText('Ssunga HC III')).toBeInTheDocument()
    expect(document.activeElement).toBe(box)
  })

  it('OPD expanded: shows the patient search box directly', () => {
    renderOpd()
    fireEvent.click(screen.getByRole('button', { name: /Expand opd navigation/ }))
    expect(screen.getByRole('searchbox', { name: /Search patients/ })).toBeInTheDocument()
  })

  it('OPD keeps the account menu in both collapsed and expanded states', () => {
    renderOpd()
    // Collapsed: compact avatar-only account trigger.
    expect(screen.getByRole('button', { name: /Dr Amina — account menu/ })).toBeInTheDocument()

    // Expanded: the account menu is still present (name shown).
    fireEvent.click(screen.getByRole('button', { name: /Expand opd navigation/ }))
    expect(screen.getByText('Dr Amina')).toBeInTheDocument()
  })

  it('a unit without patient search (e.g. Lab) renders no search affordance', () => {
    render(
      <SectionRail
        clinicName="Ssunga HC III"
        unitLabel="Lab"
        items={[{ id: 'lab-today', label: 'Today', href: '/dashboard/lab', icon: ClipboardList }]}
        pathname="/dashboard/lab"
        staff={{ displayName: 'Tech T', role: 'Lab tech', initials: 'TT' }}
      />,
    )
    expect(screen.queryByRole('button', { name: /Search patients/ })).not.toBeInTheDocument()
  })
})
