'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePatientSex } from '../../visits/actions'

export function PatientSexEditor({
  patientId,
  currentSex,
}: {
  patientId: string
  currentSex: 'M' | 'F' | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, startSaving] = useTransition()

  const handleSave = (sex: 'M' | 'F') => {
    startSaving(async () => {
      const result = await updatePatientSex(patientId, sex)
      if (!result.error) {
        setEditing(false)
        router.refresh()
      }
    })
  }

  if (!editing && currentSex) {
    return (
      <span>
        Sex: {currentSex === 'M' ? 'Male' : 'Female'}
        <button
          onClick={() => setEditing(true)}
          className="ml-1 text-blue-600 hover:underline"
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
          className="text-blue-600 hover:underline"
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
            ? 'bg-blue-100 border-blue-300 text-blue-800'
            : 'border-gray-300 hover:bg-gray-100'
        }`}
      >
        Male
      </button>
      <button
        onClick={() => handleSave('F')}
        disabled={saving}
        className={`px-2 py-0.5 rounded text-xs font-medium border ${
          currentSex === 'F'
            ? 'bg-pink-100 border-pink-300 text-pink-800'
            : 'border-gray-300 hover:bg-gray-100'
        }`}
      >
        Female
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-gray-500 hover:underline"
      >
        cancel
      </button>
    </span>
  )
}
