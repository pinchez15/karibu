'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { GuardianRelationship } from '@karibu/shared'
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIP_OPTIONS,
  isGuardianRelationship,
} from '@/lib/patient-demographics'
import type { PatientWithDerivedAge } from './actions'
import { updatePatientDemographics } from './actions'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function PatientEditSheet({
  open,
  onOpenChange,
  patient,
  onSaved,
  canRetire = false,
  onRetireRequest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: PatientWithDerivedAge
  onSaved: (patient: PatientWithDerivedAge) => void
  /** Admin-only affordance: show the "Retire duplicate" entry point. */
  canRetire?: boolean
  onRetireRequest?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState(patient.first_name ?? '')
  const [lastName, setLastName] = useState(patient.last_name ?? '')
  const [village, setVillage] = useState(patient.village ?? '')
  const [parish, setParish] = useState(patient.parish ?? '')
  const [subcounty, setSubcounty] = useState(patient.subcounty ?? '')
  const [district, setDistrict] = useState(patient.district ?? '')
  const [guardianName, setGuardianName] = useState(patient.guardian_name ?? '')
  const [guardianRelationship, setGuardianRelationship] = useState<
    GuardianRelationship | ''
  >(() =>
    patient.guardian_relationship &&
    isGuardianRelationship(patient.guardian_relationship)
      ? patient.guardian_relationship
      : '',
  )
  const [whatsappNumber, setWhatsappNumber] = useState(patient.whatsapp_number ?? '')

  useEffect(() => {
    if (!open) return
    setFirstName(patient.first_name ?? '')
    setLastName(patient.last_name ?? '')
    setVillage(patient.village ?? '')
    setParish(patient.parish ?? '')
    setSubcounty(patient.subcounty ?? '')
    setDistrict(patient.district ?? '')
    setGuardianName(patient.guardian_name ?? '')
    setGuardianRelationship(
      patient.guardian_relationship &&
        isGuardianRelationship(patient.guardian_relationship)
        ? patient.guardian_relationship
        : '',
    )
    setWhatsappNumber(patient.whatsapp_number ?? '')
    setError(null)
  }, [open, patient])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updatePatientDemographics(patient.id, {
        first_name: firstName,
        last_name: lastName,
        village: village || null,
        parish: parish || null,
        subcounty: subcounty || null,
        district: district || null,
        guardian_name: guardianName || null,
        guardian_relationship:
          guardianRelationship && isGuardianRelationship(guardianRelationship)
            ? guardianRelationship
            : null,
        whatsapp_number: whatsappNumber || null,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onSaved(result.patient)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit patient details</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {patient.patient_id != null && (
            <p className="text-xs text-muted-foreground">
              Patient ID #{patient.patient_id} cannot be changed.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-first-name">First name *</Label>
              <Input
                id="edit-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-last-name">Last name *</Label>
              <Input
                id="edit-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone (optional)</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+256 7XX XXX XXX"
            />
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-village" className="text-xs text-muted-foreground">
                  Village
                </Label>
                <Input
                  id="edit-village"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-parish" className="text-xs text-muted-foreground">
                  Parish
                </Label>
                <Input
                  id="edit-parish"
                  value={parish}
                  onChange={(e) => setParish(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-subcounty" className="text-xs text-muted-foreground">
                  Subcounty
                </Label>
                <Input
                  id="edit-subcounty"
                  value={subcounty}
                  onChange={(e) => setSubcounty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-district" className="text-xs text-muted-foreground">
                  District
                </Label>
                <Input
                  id="edit-district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-guardian-name">Guardian name</Label>
              <Input
                id="edit-guardian-name"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-guardian-relationship">Relationship</Label>
              <select
                id="edit-guardian-relationship"
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
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </form>

        {canRetire && onRetireRequest && (
          <div className="mt-8 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Registered twice by mistake? Retiring hides this record from search
              and check-in while keeping its history.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive hover:text-destructive"
              onClick={onRetireRequest}
              disabled={pending}
            >
              Retire duplicate record…
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
