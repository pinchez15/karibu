'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ClinicianSearchBarProps {
  className?: string
  /** Initial query when landing with ?search= in the URL. */
  defaultQuery?: string
}

/**
 * Dashboard header search — routes to Patients (/dashboard/visits) with ?search=.
 */
export function ClinicianSearchBar({ className, defaultQuery = '' }: ClinicianSearchBarProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(defaultQuery)

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <form
      className={cn('relative w-[280px] shrink-0', className)}
      onSubmit={(event) => {
        event.preventDefault()
        goToSearch(query)
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search patients, visits, codes"
        className="h-9 cursor-text pl-9 pr-14 text-[13px]"
        aria-label="Search patients, visits, and codes"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">
        ⌘K
      </kbd>
    </form>
  )
}
