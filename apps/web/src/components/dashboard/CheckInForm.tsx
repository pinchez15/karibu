'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared'
import type { VisitPriority } from '@karibu/shared'

interface CheckInFormProps {
  clinicId: string
  staffId: string
}

export function CheckInForm({ clinicId, staffId }: CheckInFormProps) {
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
        p_staff_id: staffId,
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
        className="btn-primary flex items-center gap-2"
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
            <div className="fixed inset-0 bg-slate-900/50" onClick={handleClose} />

            <div className="relative bg-white rounded-lg border border-slate-200 max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-800">Check In Patient</h3>
                <button
                  onClick={handleClose}
                  className="p-2 text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="data-label mb-1 block">
                      WhatsApp Number
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+256 7XX XXX XXX"
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-base"
                      />
                      <button
                        type="button"
                        onClick={handleLookup}
                        disabled={loading}
                        className="btn-secondary"
                      >
                        Lookup
                      </button>
                    </div>
                  </div>

                  {patientFound && (
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-sm font-medium text-emerald-800">Patient Found</p>
                      <p className="text-sm text-emerald-700">{patientFound.name || 'Unnamed'}</p>
                    </div>
                  )}

                  {isNewPatient && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm font-medium text-amber-800 mb-2">New Patient</p>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Patient name (optional)"
                        className="w-full px-4 py-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white text-base"
                      />
                    </div>
                  )}

                  {(patientFound || isNewPatient) && (
                    <>
                      <div>
                        <label className="data-label mb-1 block">
                          Chief Complaint
                        </label>
                        <textarea
                          value={chiefComplaint}
                          onChange={(e) => setChiefComplaint(e.target.value)}
                          placeholder="What brings the patient in today?"
                          rows={3}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-base"
                        />
                      </div>

                      <div>
                        <label className="data-label mb-2 block">
                          Priority
                        </label>
                        <div className="flex gap-2">
                          {(['low', 'normal', 'high', 'urgent'] as VisitPriority[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPriority(p)}
                              className={`flex-1 min-h-touch text-sm font-medium rounded-lg border transition-colors ${
                                priority === p
                                  ? p === 'urgent'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : p === 'high'
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : p === 'normal'
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-slate-600 text-white border-slate-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
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
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary flex-1"
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
