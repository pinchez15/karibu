'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePatientSex } from '../../visits/actions'

export function PatientSexEditor({
  patientId,
  currentSex,
  onSaved,
}: {
  patientId: string
  currentSex: 'M' | 'F' | null
  onSaved?: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, startSaving] = useTransition()

  const handleSave = (sex: 'M' | 'F') => {
    startSaving(async () => {
      const result = await updatePatientSex(patientId, sex)
      if (!result.error) {
        setEditing(false)
        onSaved?.()
        if (!onSaved) router.refresh()
      }
    })
  }

  if (!editing && currentSex) {
    return (
      <span>
        Sex: {currentSex === 'M' ? 'Male' : 'Female'}
        <button
          onClick={() => setEditing(true)}
          className="ml-1 text-primary hover:underline"
        >
          edit
        </button>
      </span>
    )
  }

  if (!editing && !currentSex) {
    return (
      <span className="text-amber-600">
        Sex: Not set{' '}
        <button
          onClick={() => setEditing(true)}
          className="text-primary hover:underline"
        >
          set now
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      Sex:
      <button
        onClick={() => handleSave('M')}
        disabled={saving}
        className={`px-2 py-0.5 rounded text-xs font-medium border ${
          currentSex === 'M'
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'border-input hover:bg-secondary'
        }`}
      >
        Male
      </button>
      <button
        onClick={() => handleSave('F')}
        disabled={saving}
        className={`px-2 py-0.5 rounded text-xs font-medium border ${
          currentSex === 'F'
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'border-input hover:bg-secondary'
        }`}
      >
        Female
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-muted-foreground hover:underline"
      >
        cancel
      </button>
    </span>
  )
}
