'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPatientWithVisit } from './actions'

function formatUgandaDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
}

function formatUgandaDateDisplay(value: string | null | undefined) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[3]}-${match[2]}-${match[1]}`
}

export function PatientsToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams?.get('search') || '')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [creating, startCreating] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [duplicateCandidate, setDuplicateCandidate] = useState<{
    id: string
    patient_id: number | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
    date_of_birth: string | null
  } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const formRef = useRef<HTMLFormElement>(null)

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
    setDuplicateCandidate(null)
    startCreating(async () => {
      const result = await createPatientWithVisit(formData)
      if (result.error) {
        setError(result.error)
      } else if (result.duplicateCandidate) {
        setDuplicateCandidate(result.duplicateCandidate)
      } else if (result.visitId) {
        router.push(`/dashboard/visits/${result.visitId}`)
      }
    })
  }

  const submitWithDuplicateChoice = (choice: 'existing' | 'new') => {
    const form = formRef.current
    if (!form || !duplicateCandidate) return
    const formData = new FormData(form)
    if (choice === 'existing') {
      formData.set('existing_patient_id', duplicateCandidate.id)
    } else {
      formData.set('confirm_duplicate', 'true')
    }
    handleCreatePatient(formData)
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
        <form ref={formRef} action={handleCreatePatient} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp_number">Phone (optional)</Label>
              <Input
                id="whatsapp_number"
                name="whatsapp_number"
                placeholder="+256 7XX XXX XXX"
                type="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                name="first_name"
                placeholder="Given name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                name="last_name"
                placeholder="Family name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of Birth *</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="text"
                placeholder="DD-MM-YYYY"
                inputMode="numeric"
                onChange={(e) => {
                  e.currentTarget.value = formatUgandaDateInput(e.currentTarget.value)
                }}
                required
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
          {duplicateCandidate && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
              <p className="text-sm text-amber-900">
                Possible existing patient found: {[duplicateCandidate.first_name, duplicateCandidate.last_name].filter(Boolean).join(' ') || duplicateCandidate.display_name || 'Unknown'}
                {duplicateCandidate.patient_id ? ` (#${duplicateCandidate.patient_id})` : ''}
                {duplicateCandidate.date_of_birth ? ` · DOB ${formatUgandaDateDisplay(duplicateCandidate.date_of_birth)}` : ''}
              </p>
              <div className="flex gap-2">
                <Button type="button" onClick={() => submitWithDuplicateChoice('existing')} disabled={creating}>
                  Use Existing Patient
                </Button>
                <Button type="button" variant="outline" onClick={() => submitWithDuplicateChoice('new')} disabled={creating}>
                  Create New Anyway
                </Button>
              </div>
            </div>
          )}
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
