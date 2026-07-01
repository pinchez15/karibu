'use client'

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * Compact patient search for the OPD unit sidebar — routes to the register
 * with ?search= (same destination as the header ClinicianSearchBar).
 */
export function SidebarPatientSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const goToSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (!trimmed) {
        router.push('/dashboard/visits')
        return
      }
      const params = new URLSearchParams({ search: trimmed })
      router.push(`/dashboard/visits?${params.toString()}`)
    },
    [router],
  )

  return (
    <form
      className="relative"
      onSubmit={(event) => {
        event.preventDefault()
        goToSearch(inputRef.current?.value ?? '')
      }}
    >
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search patients…"
        className="h-8 pl-8 text-[12px]"
        aria-label="Search patients"
      />
    </form>
  )
}
