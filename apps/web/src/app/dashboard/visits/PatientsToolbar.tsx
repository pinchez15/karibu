'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Plus, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  checkInExistingPatient,
  createPatientWithVisit,
  findPatientCandidates,
  type DobPrecision,
  type DuplicateCandidate,
} from './actions'
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIP_OPTIONS,
} from '@/lib/patient-demographics'
import type { GuardianRelationship } from '@karibu/shared'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

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

const PRECISION_OPTIONS: { value: DobPrecision; label: string }[] = [
  { value: 'exact', label: 'Exact date' },
  { value: 'year_only', label: 'Year only' },
  { value: 'age_estimate', label: 'Approx. age' },
  { value: 'unknown', label: 'Unknown' },
]

const MATCH_REASON_LABEL: Record<string, string> = {
  name_match: 'Similar name',
  same_village: 'Same village',
  same_parish: 'Same parish',
  national_id_match: 'Same national ID',
  age_match: 'Similar age',
}

function humanizeMatchReason(reason: string): string {
  return MATCH_REASON_LABEL[reason] ?? reason
}

function candidateAgeLabel(c: DuplicateCandidate): string | null {
  if (c.derived_age !== null && c.derived_age !== undefined) {
    return `${c.derived_age}y`
  }
  if (c.date_of_birth) return `DOB ${formatUgandaDateDisplay(c.date_of_birth)}`
  if (c.birth_year) return `b. ${c.birth_year}`
  if (c.approximate_age !== null && c.approximate_age !== undefined) return `~${c.approximate_age}y`
  return null
}

function CandidateCard({
  candidate,
  onCheckIn,
  disabled,
}: {
  candidate: DuplicateCandidate
  onCheckIn: (id: string) => void
  disabled: boolean
}) {
  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Unknown'
  const ageLabel = candidateAgeLabel(candidate)
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-foreground">{name}</span>
        {candidate.patient_id ? (
          <span className="text-muted-foreground">#{candidate.patient_id}</span>
        ) : null}
        {candidate.sex ? (
          <span className="text-muted-foreground">{candidate.sex}</span>
        ) : null}
        {ageLabel ? (
          <span className="text-muted-foreground">{ageLabel}</span>
        ) : null}
        {candidate.village ? (
          <span className="text-muted-foreground">· {candidate.village}</span>
        ) : null}
      </div>
      {candidate.match_reasons && candidate.match_reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {candidate.match_reasons.map((reason) => (
            <Badge key={reason} variant="info">
              {humanizeMatchReason(reason)}
            </Badge>
          ))}
        </div>
      )}
      <div>
        <Button
          type="button"
          size="sm"
          onClick={() => onCheckIn(candidate.id)}
          disabled={disabled}
        >
          Check in for today
        </Button>
      </div>
    </div>
  )
}

export function PatientsToolbar({ defaultDistrict = '' }: { defaultDistrict?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams?.get('search') || '')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [creating, startCreating] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form-state hooks
  const [precision, setPrecision] = useState<DobPrecision>('exact')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [village, setVillage] = useState('')
  const [parish, setParish] = useState('')
  const [district, setDistrict] = useState(defaultDistrict)
  const [sex, setSex] = useState<'M' | 'F' | ''>('')
  const [birthYear, setBirthYear] = useState('')
  const [approximateAge, setApproximateAge] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship | ''>('')
  const [moreOpen, setMoreOpen] = useState(false)

  // Duplicate detection state.
  // `serverCandidates` is set when the server action returns matches at submit
  // time. `liveCandidates` is the proactive suggestion list from typing.
  const [serverCandidates, setServerCandidates] = useState<DuplicateCandidate[] | null>(null)
  const [liveCandidates, setLiveCandidates] = useState<DuplicateCandidate[]>([])
  const [lookupPending, setLookupPending] = useState(false)

  useEffect(() => {
    setDistrict(defaultDistrict)
  }, [defaultDistrict])

  useEffect(() => {
    setSearch(searchParams?.get('search') || '')
  }, [searchParams])

  const applySearch = (term: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (term.trim()) {
      params.set('search', term.trim())
    } else {
      params.delete('search')
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lookupVersionRef = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)

  const effectiveAge = useMemo<number | null>(() => {
    const now = new Date()
    if (precision === 'year_only') {
      const y = Number(birthYear)
      if (!Number.isFinite(y) || y < 1900) return null
      return now.getUTCFullYear() - y
    }
    if (precision === 'age_estimate') {
      const a = Number(approximateAge)
      if (!Number.isFinite(a) || a < 0) return null
      return a
    }
    return null
  }, [precision, birthYear, approximateAge])

  // Proactive duplicate lookup: debounced when name + (optionally) village are
  // populated enough to be meaningful. Always runs alongside the server-side
  // recheck at submit time.
  useEffect(() => {
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current)
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const trimmedVillage = village.trim()
    const trimmedParish = parish.trim()

    if (trimmedFirst.length < 2 || trimmedLast.length < 2) {
      setLiveCandidates([])
      setLookupPending(false)
      return
    }

    setLookupPending(true)
    const version = ++lookupVersionRef.current
    lookupTimeoutRef.current = setTimeout(async () => {
      const result = await findPatientCandidates({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        village: trimmedVillage || null,
        parish: trimmedParish || null,
        age: effectiveAge,
        sex: sex || null,
      })
      // Drop stale responses.
      if (version !== lookupVersionRef.current) return
      setLiveCandidates(result.candidates ?? [])
      setLookupPending(false)
    }, 400)

    return () => {
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current)
    }
  }, [firstName, lastName, village, parish, effectiveAge, sex])

  const resetForm = () => {
    setPrecision('exact')
    setFirstName('')
    setLastName('')
    setVillage('')
    setParish('')
    setDistrict(defaultDistrict)
    setSex('')
    setBirthYear('')
    setApproximateAge('')
    setGuardianRelationship('')
    setMoreOpen(false)
    setError(null)
    setServerCandidates(null)
    setLiveCandidates([])
  }

  const handleCreatePatient = (formData: FormData) => {
    setError(null)
    setServerCandidates(null)
    startCreating(async () => {
      const result = await createPatientWithVisit(formData)
      if (result.error) {
        setError(result.error)
      } else if (result.duplicateCandidates && result.duplicateCandidates.length > 0) {
        setServerCandidates(result.duplicateCandidates)
      } else if (result.visitId) {
        resetForm()
        setShowNewPatient(false)
        router.push(`/dashboard/visits/${result.visitId}`)
      } else if (result.patientId) {
        // Register-only: no visit today. Land on the patient chart.
        resetForm()
        setShowNewPatient(false)
        router.push(`/dashboard/patients/${result.patientId}`)
      }
    })
  }

  const submitForm = (extra?: Record<string, string>) => {
    const form = formRef.current
    if (!form) return
    const formData = new FormData(form)
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        formData.set(k, v)
      }
    }
    handleCreatePatient(formData)
  }

  // Register + check in (default) vs register only (no visit today).
  const registerAndCheckIn = () => submitForm({ check_in: 'true' })
  const registerOnly = () => submitForm({ check_in: 'false' })

  // One-tap check-in for an already-registered patient found via duplicate
  // detection — decoupled from creating a new record (WP2 A2).
  const checkInCandidate = (id: string) => {
    setError(null)
    startCreating(async () => {
      const result = await checkInExistingPatient(id)
      if ('error' in result) {
        setError(result.error)
      } else {
        resetForm()
        setShowNewPatient(false)
        router.push(`/dashboard/visits/${result.visitId}`)
      }
    })
  }

  const createAnyway = () => {
    submitForm({ confirm_duplicate: 'true', check_in: 'true' })
  }

  const displayCandidates = serverCandidates ?? (liveCandidates.length > 0 ? liveCandidates : null)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applySearch(search)
              }
            }}
            placeholder="Search name, patient #, phone, or address..."
            className="pl-9"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => applySearch(search)}>
          Search
        </Button>
        <Button
          onClick={() => {
            setShowNewPatient(!showNewPatient)
            setError(null)
          }}
          variant={showNewPatient ? 'outline' : 'default'}
        >
          {showNewPatient ? (
            <>
              <X className="h-4 w-4 mr-1" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" /> New Patient
            </>
          )}
        </Button>
      </div>

      {showNewPatient && (
        <form
          ref={formRef}
          action={handleCreatePatient}
          className="bg-card border border-border rounded-lg p-4 space-y-4"
        >
          {/* Hidden inputs that mirror controlled state so they're included in FormData */}
          <input type="hidden" name="dob_precision" value={precision} />
          <input type="hidden" name="district" value={district} />
          {guardianRelationship ? (
            <input type="hidden" name="guardian_relationship" value={guardianRelationship} />
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                name="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Given name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                name="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Family name"
                required
              />
            </div>
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
              <Label>Sex *</Label>
              <div className="flex gap-4 pt-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sex"
                    value="M"
                    checked={sex === 'M'}
                    onChange={() => setSex('M')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Male</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sex"
                    value="F"
                    checked={sex === 'F'}
                    onChange={() => setSex('F')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Female</span>
                </label>
              </div>
            </div>
          </div>

          {/* Age precision selector */}
          <div className="space-y-2">
            <Label>Age information</Label>
            <div
              role="radiogroup"
              aria-label="Age precision"
              className="inline-flex flex-wrap rounded-md border border-border bg-background p-1 gap-1"
            >
              {PRECISION_OPTIONS.map((opt) => {
                const active = precision === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPrecision(opt.value)}
                    className={
                      'text-xs sm:text-sm px-3 py-1.5 rounded transition-colors ' +
                      (active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted')
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {precision === 'exact' && (
              <div className="space-y-1.5 max-w-xs">
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
            )}
            {precision === 'year_only' && (
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="birth_year">Birth Year *</Label>
                <Input
                  id="birth_year"
                  name="birth_year"
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getUTCFullYear()}
                  step={1}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="e.g. 1985"
                  required
                />
              </div>
            )}
            {precision === 'age_estimate' && (
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="approximate_age">Approximate age *</Label>
                <Input
                  id="approximate_age"
                  name="approximate_age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={130}
                  step={1}
                  value={approximateAge}
                  onChange={(e) => setApproximateAge(e.target.value)}
                  placeholder="Years"
                  required
                />
                <p className="text-xs text-muted-foreground">(recorded today)</p>
              </div>
            )}
            {precision === 'unknown' && (
              <p className="text-xs text-muted-foreground">
                No age recorded. The patient won&apos;t appear in age-banded reports.
              </p>
            )}
          </div>

          {/* Location section */}
          <div className="space-y-2">
            <Label>Location</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="village" className="text-xs text-muted-foreground">
                  Village
                </Label>
                <Input
                  id="village"
                  name="village"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder="Village"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parish" className="text-xs text-muted-foreground">
                  Parish
                </Label>
                <Input
                  id="parish"
                  name="parish"
                  value={parish}
                  onChange={(e) => setParish(e.target.value)}
                  placeholder="Parish"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="district" className="text-xs text-muted-foreground">
                  District
                </Label>
                <Input
                  id="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="District"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              District defaults from your clinic — change if the patient is from elsewhere.
            </p>
          </div>

          {/* More: subcounty, guardian, national_id */}
          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={
                    'h-4 w-4 transition-transform ' + (moreOpen ? 'rotate-180' : '')
                  }
                />
                More
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="subcounty" className="text-xs text-muted-foreground">
                    Subcounty
                  </Label>
                  <Input id="subcounty" name="subcounty" placeholder="Subcounty" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_name" className="text-xs text-muted-foreground">
                    Guardian name
                  </Label>
                  <Input
                    id="guardian_name"
                    name="guardian_name"
                    placeholder="Parent / guardian"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian_relationship" className="text-xs text-muted-foreground">
                    Guardian relationship
                  </Label>
                  <select
                    id="guardian_relationship"
                    className={selectClassName}
                    value={guardianRelationship}
                    onChange={(e) =>
                      setGuardianRelationship(e.target.value as GuardianRelationship | '')
                    }
                  >
                    <option value="">—</option>
                    {GUARDIAN_RELATIONSHIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {GUARDIAN_RELATIONSHIP_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="national_id" className="text-xs text-muted-foreground">
                    National ID
                  </Label>
                  <Input id="national_id" name="national_id" placeholder="NIN" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {displayCandidates && displayCandidates.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
              <p className="text-sm text-amber-900">
                {serverCandidates
                  ? 'Possible existing patient — please review before creating a new record.'
                  : `Possible existing patient${displayCandidates.length > 1 ? 's' : ''} found — review before saving.`}
              </p>
              <div className="space-y-2">
                {displayCandidates.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onCheckIn={checkInCandidate}
                    disabled={creating}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={createAnyway}
                disabled={creating}
              >
                Create new patient anyway
              </Button>
            </div>
          )}

          {!displayCandidates && lookupPending && (
            <p className="text-xs text-muted-foreground">Checking for existing patients...</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={registerAndCheckIn} disabled={creating}>
              {creating ? 'Saving...' : 'Register + check in'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={registerOnly}
              disabled={creating}
            >
              Register only
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            &ldquo;Register + check in&rdquo; adds the patient to today&rsquo;s queue with a
            number. &ldquo;Register only&rdquo; saves the record without a visit.
          </p>
        </form>
      )}
    </div>
  )
}
