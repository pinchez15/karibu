'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'
import type { VisitPriority } from '@karibu/shared'

interface CheckInFormProps {
  clinicId: string
}

export function CheckInForm({ clinicId }: CheckInFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [patientName, setPatientName] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [priority, setPriority] = useState<VisitPriority>('normal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientFound, setPatientFound] = useState<{ id: string; name: string | null } | null>(null)
  const [isNewPatient, setIsNewPatient] = useState(false)

  const supabase = getSupabase()

  const handleLookup = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number')
      return
    }

    const formatted = formatPhoneNumber(phoneNumber)
    if (!isValidUgandaPhone(formatted)) {
      setError('Please enter a valid Uganda phone number (+256...)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: lookupError } = await supabase
        .from('patients')
        .select('id, display_name')
        .eq('clinic_id', clinicId)
        .eq('whatsapp_number', formatted)
        .single()

      if (lookupError && lookupError.code !== 'PGRST116') {
        throw lookupError
      }

      if (data) {
        setPatientFound({ id: data.id, name: data.display_name })
        setPatientName(data.display_name || '')
        setIsNewPatient(false)
      } else {
        setPatientFound(null)
        setIsNewPatient(true)
      }
    } catch (err) {
      console.error('Lookup error:', err)
      setError('Failed to look up patient')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let patientId = patientFound?.id

      // Create patient if new
      if (!patientId) {
        const formatted = formatPhoneNumber(phoneNumber)
        const { data: newPatient, error: createError } = await supabase
          .from('patients')
          .insert({
            clinic_id: clinicId,
            whatsapp_number: formatted,
            display_name: patientName || null,
          })
          .select('id')
          .single()

        if (createError) throw createError
        patientId = newPatient.id
      }

      // Check in patient
      const { data: visitId, error: checkInError } = await supabase.rpc('check_in_patient', {
        p_clinic_id: clinicId,
        p_patient_id: patientId,
        p_chief_complaint: chiefComplaint || null,
        p_priority: priority,
      })

      if (checkInError) throw checkInError

      // Reset form and close
      setPhoneNumber('')
      setPatientName('')
      setChiefComplaint('')
      setPriority('normal')
      setPatientFound(null)
      setIsNewPatient(false)
      setIsOpen(false)
    } catch (err) {
      console.error('Check-in error:', err)
      setError('Failed to check in patient')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    setPhoneNumber('')
    setPatientName('')
    setChiefComplaint('')
    setPriority('normal')
    setPatientFound(null)
    setIsNewPatient(false)
    setError(null)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Check In Patient
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/50" onClick={handleClose} />

            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Check In Patient</h3>
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      WhatsApp Number
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+256 7XX XXX XXX"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleLookup}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50"
                      >
                        Lookup
                      </button>
                    </div>
                  </div>

                  {patientFound && (
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-sm font-medium text-green-800">Patient Found</p>
                      <p className="text-sm text-green-700">{patientFound.name || 'Unnamed'}</p>
                    </div>
                  )}

                  {isNewPatient && (
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 mb-2">New Patient</p>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Patient name (optional)"
                        className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      />
                    </div>
                  )}

                  {(patientFound || isNewPatient) && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Chief Complaint
                        </label>
                        <textarea
                          value={chiefComplaint}
                          onChange={(e) => setChiefComplaint(e.target.value)}
                          placeholder="What brings the patient in today?"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Priority
                        </label>
                        <div className="flex gap-2">
                          {(['low', 'normal', 'high', 'urgent'] as VisitPriority[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPriority(p)}
                              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                priority === p
                                  ? p === 'urgent'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : p === 'high'
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : p === 'normal'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-gray-600 text-white border-gray-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {(patientFound || isNewPatient) && (
                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Checking in...' : 'Check In'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
