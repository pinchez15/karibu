'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPatientWithVisit } from './actions'

export function PatientsToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams?.get('search') || '')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [creating, startCreating] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const updateSearch = (term: string) => {
    setSearch(term)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString())
      if (term) {
        params.set('search', term)
      } else {
        params.delete('search')
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    }, 300)
  }

  const handleCreatePatient = (formData: FormData) => {
    setError(null)
    startCreating(async () => {
      const result = await createPatientWithVisit(formData)
      if (result.error) {
        setError(result.error)
      } else if (result.visitId) {
        router.push(`/dashboard/visits/${result.visitId}`)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => { setShowNewPatient(!showNewPatient); setError(null) }}
          variant={showNewPatient ? 'outline' : 'default'}
        >
          {showNewPatient ? (
            <><X className="h-4 w-4 mr-1" /> Cancel</>
          ) : (
            <><Plus className="h-4 w-4 mr-1" /> New Patient</>
          )}
        </Button>
      </div>

      {showNewPatient && (
        <form action={handleCreatePatient} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp_number">WhatsApp Number *</Label>
              <Input
                id="whatsapp_number"
                name="whatsapp_number"
                placeholder="+256 7XX XXX XXX"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Patient Name</Label>
              <Input
                id="display_name"
                name="display_name"
                placeholder="Patient name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sex</Label>
              <div className="flex gap-4 pt-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="sex" value="M" className="accent-primary" />
                  <span className="text-sm">Male</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="sex" value="F" className="accent-primary" />
                  <span className="text-sm">Female</span>
                </label>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create Patient & Start Visit'}
          </Button>
        </form>
      )}
    </div>
  )
}
