'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updatePatientAgeEstimate } from '@/app/dashboard/visits/actions'

export function PatientAgeQuickSet({
  patientId,
  onSaved,
}: {
  patientId: string
  onSaved?: () => void
}) {
  const [age, setAge] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="kh-meta block">Age (years)</label>
        <Input
          type="number"
          min={0}
          max={120}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="w-24"
          placeholder="e.g. 34"
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending || !age}
        onClick={() => {
          setError(null)
          const n = parseInt(age, 10)
          if (Number.isNaN(n) || n < 0) {
            setError('Enter a valid age')
            return
          }
          start(async () => {
            const result = await updatePatientAgeEstimate(patientId, n)
            if (result.error) {
              setError(result.error)
              return
            }
            onSaved?.()
          })
        }}
      >
        {pending ? 'Saving…' : 'Save age'}
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}
