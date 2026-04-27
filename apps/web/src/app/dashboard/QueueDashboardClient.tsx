'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import {
  fetchQueueData,
  assignToNurse,
  markReadyForDoctor,
  claimPatient,
  addPatientToQueue,
  searchPatients,
} from './actions'
import {
  Users,
  UserCheck,
  Stethoscope,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  UserPlus,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { QueueItem, QueueStatus, Patient } from '@karibu/shared'

interface QueueDashboardClientProps {
  initialQueue: QueueItem[]
  reviewCount: number
  clinicId: string
  staffId: string
  staffRole: 'admin' | 'doctor' | 'nurse'
  staffName: string
}

const priorityConfig = {
  low: { label: 'Low', color: 'text-muted-foreground', bg: 'bg-muted' },
  normal: { label: 'Normal', color: 'text-primary', bg: 'bg-primary/10' },
  high: { label: 'High', color: 'text-amber-700', bg: 'bg-amber-500/15' },
  urgent: { label: 'Urgent', color: 'text-destructive', bg: 'bg-destructive/10' },
}

function getWaitTime(minutes: number): string {
  if (minutes < 1) return 'Just now'
  if (minutes === 1) return '1 min'
  if (minutes < 60) return `${minutes} mins`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export function QueueDashboardClient({
  initialQueue,
  reviewCount,
  clinicId,
  staffId,
  staffRole,
}: QueueDashboardClientProps) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue)
  const [loading, setLoading] = useState<string | null>(null)
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [addingPatient, setAddingPatient] = useState(false)
  const [addMessage, setAddMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    sex: '' as '' | 'M' | 'F',
    whatsapp_number: '',
    chief_complaint: '',
  })
  const supabase = getSupabase()

  const isDoctor = staffRole === 'doctor' || staffRole === 'admin'
  const isNurse = staffRole === 'nurse' || staffRole === 'admin'

  // Filter queue by status
  const waitingNurse = queue.filter(q => q.queue_status === 'waiting')
  const withNurse = queue.filter(q => q.queue_status === 'with_nurse')
  const readyForDoctor = queue.filter(q => q.queue_status === 'ready_for_doctor')
  const withDoctor = queue.filter(q => q.queue_status === 'with_doctor')
  const completed = queue.filter(q => q.queue_status === 'completed')

  const totalWaiting = waitingNurse.length + withNurse.length + readyForDoctor.length

  // Real-time updates via broadcast (trigger on visits table)
  useEffect(() => {
    const topic = `queue-updates:${clinicId}`
    const channel = supabase
      .channel(topic, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'queue_changed' }, () => refreshQueue())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clinicId])

  const refreshQueue = async () => {
    const data = await fetchQueueData(clinicId)
    setQueue(data)
  }

  const handleAssignToNurse = async (visitId: string) => {
    setLoading(visitId)
    try {
      const result = await assignToNurse(visitId)
      if (result.error) throw new Error(result.error)
      await refreshQueue()
    } catch (error) {
      console.error('Failed to assign:', error)
    } finally {
      setLoading(null)
    }
  }

  const handleMarkReady = async (visitId: string) => {
    setLoading(visitId)
    try {
      const result = await markReadyForDoctor(visitId)
      if (result.error) throw new Error(result.error)
      await refreshQueue()
    } catch (error) {
      console.error('Failed to mark ready:', error)
    } finally {
      setLoading(null)
    }
  }

  const handleClaimPatient = async (visitId: string) => {
    setLoading(visitId)
    try {
      const result = await claimPatient(visitId)
      if (result.error) throw new Error(result.error)
      await refreshQueue()
    } catch (error) {
      console.error('Failed to claim:', error)
    } finally {
      setLoading(null)
    }
  }

  // Patient search with debounce
  useEffect(() => {
    if (patientSearch.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      const results = await searchPatients(patientSearch)
      setSearchResults(results)
    }, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])

  const handleSelectExisting = (patient: Patient) => {
    setSelectedPatient(patient)
    setNewPatient({
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      date_of_birth: patient.date_of_birth || '',
      sex: (patient.sex as 'M' | 'F') || '',
      whatsapp_number: patient.whatsapp_number || '',
      chief_complaint: '',
    })
    setPatientSearch('')
    setSearchResults([])
  }

  const handleClearSelected = () => {
    setSelectedPatient(null)
    setNewPatient({ first_name: '', last_name: '', date_of_birth: '', sex: '', whatsapp_number: '', chief_complaint: '' })
  }

  const handleAddToQueue = async () => {
    if (!newPatient.first_name || !newPatient.last_name || !newPatient.date_of_birth || !newPatient.sex) {
      setAddMessage({ type: 'error', text: 'First name, last name, date of birth, and sex are required' })
      return
    }

    setAddingPatient(true)
    setAddMessage(null)

    const result = await addPatientToQueue({
      first_name: newPatient.first_name,
      last_name: newPatient.last_name,
      date_of_birth: newPatient.date_of_birth,
      sex: newPatient.sex as 'M' | 'F',
      whatsapp_number: newPatient.whatsapp_number || undefined,
      chief_complaint: newPatient.chief_complaint || undefined,
      existing_patient_id: selectedPatient?.id,
    })

    setAddingPatient(false)

    if (result.error) {
      setAddMessage({ type: 'error', text: result.error })
    } else {
      setAddMessage({
        type: 'success',
        text: `${newPatient.first_name} ${newPatient.last_name} added to queue${result.patient_id ? ` (#${result.patient_id})` : ''}`,
      })
      setShowAddPatient(false)
      handleClearSelected()
      await refreshQueue()
    }
  }

  const QueueCard = ({ item, showActions = true, linkTo }: { item: QueueItem; showActions?: boolean; linkTo?: string }) => {
    const isUrgent = item.priority === 'urgent'
    const isHigh = item.priority === 'high'

    const Wrapper = linkTo
      ? ({ children, className }: { children: React.ReactNode; className: string }) => (
          <Link href={linkTo} className={`block ${className} hover:bg-secondary/50 transition-colors`}>{children}</Link>
        )
      : ({ children, className }: { children: React.ReactNode; className: string }) => (
          <div className={className}>{children}</div>
        )

    return (
      <Wrapper className={`bg-card border rounded-xl p-4 space-y-3 ${
        isUrgent ? 'border-destructive/40 bg-destructive/5' :
        isHigh ? 'border-amber-500/40 bg-amber-500/5' :
        'border-border'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link
                href={`/dashboard/patients/${item.patient_id}`}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {item.patient_name || 'Unknown Patient'}
              </Link>
              {isUrgent && (
                <Badge variant="urgent" className="text-xs">Urgent</Badge>
              )}
              {isHigh && !isUrgent && (
                <Badge variant="warning" className="text-xs">High</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.chief_complaint || 'No complaint recorded'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>#{item.queue_position}</span>
          <span>{getWaitTime(item.wait_minutes)} wait</span>
          {item.nurse_name && <span>Nurse: {item.nurse_name}</span>}
          {item.doctor_name && <span>Dr. {item.doctor_name}</span>}
        </div>

        {showActions && (
          <div className="flex gap-2">
            {item.queue_status === 'waiting' && isNurse && (
              <Button
                size="sm"
                onClick={() => handleAssignToNurse(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10"
              >
                {loading === item.visit_id ? 'Starting...' : 'Call Patient'}
              </Button>
            )}

            {item.queue_status === 'with_nurse' && item.nurse_id === staffId && (
              <Button
                size="sm"
                onClick={() => handleMarkReady(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {loading === item.visit_id ? 'Updating...' : 'Send to Doctor'}
              </Button>
            )}

            {item.queue_status === 'ready_for_doctor' && isDoctor && (
              <Button
                size="sm"
                onClick={() => handleClaimPatient(item.visit_id)}
                disabled={loading === item.visit_id}
                className="flex-1 h-10"
              >
                {loading === item.visit_id ? 'Claiming...' : 'Start Encounter'}
              </Button>
            )}

            {item.queue_status === 'with_doctor' && item.doctor_id === staffId && (
              <Link href={`/dashboard/visits/${item.visit_id}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full h-10">
                  View Patient
                </Button>
              </Link>
            )}
          </div>
        )}
      </Wrapper>
    )
  }

  // Combine nurse queue and with_nurse for the Nurse tab
  const nurseTabItems = [...waitingNurse, ...withNurse].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
    return (a.wait_minutes || 0) - (b.wait_minutes || 0)
  })

  // Doctor tab: ready_for_doctor + with_doctor
  const doctorTabItems = [...readyForDoctor, ...withDoctor].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
    return (a.wait_minutes || 0) - (b.wait_minutes || 0)
  })

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Queue stats strip */}
      <div className="bg-muted/30 border-b border-border px-4 py-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-amber-600">{waitingNurse.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Waiting</p>
          </div>
          <div className="bg-card rounded-xl p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-primary">{readyForDoctor.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Ready for Doctor</p>
          </div>
          <div className="bg-card rounded-xl p-3 text-center border border-border">
            <p className="text-2xl font-semibold text-accent">{completed.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Done Today</p>
          </div>
        </div>

        {/* Review queue banner */}
        {reviewCount > 0 && (
          <Link
            href="/dashboard/review"
            className="mt-3 flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-3 hover:bg-primary/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {reviewCount} visit{reviewCount > 1 ? 's' : ''} to review
              </span>
            </div>
            <span className="text-sm text-primary">Review &rarr;</span>
          </Link>
        )}
      </div>

      {/* Add patient message */}
      {addMessage && !showAddPatient && (
        <div className={`mx-4 mt-3 p-3 rounded-xl text-sm border ${
          addMessage.type === 'success'
            ? 'bg-accent/10 text-accent border-accent/30'
            : 'bg-destructive/10 text-destructive border-destructive/30'
        }`}>
          {addMessage.text}
        </div>
      )}

      {/* Add Patient Panel */}
      {showAddPatient && (
        <div className="border-b border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Add Patient to Queue</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowAddPatient(false); handleClearSelected() }}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {addMessage && (
            <div className={`p-3 rounded-xl text-sm ${
              addMessage.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'
            }`}>
              {addMessage.text}
            </div>
          )}

          {/* Search for returning patient */}
          {!selectedPatient && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search by name (returning patient)..."
                  className="pl-9"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectExisting(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary/50 text-sm flex justify-between items-center"
                    >
                      <span className="font-medium">{[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'}</span>
                      <span className="text-muted-foreground text-xs">
                        {p.patient_id ? `#${p.patient_id}` : ''}{p.sex ? ` · ${p.sex}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected returning patient badge */}
          {selectedPatient && (
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
              <Badge variant="outline" className="text-xs">Returning</Badge>
              <span className="text-sm font-medium flex-1">
                {[selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')} ({selectedPatient.patient_id ? `#${selectedPatient.patient_id}` : 'ID pending'})
              </span>
              <Button variant="ghost" size="sm" onClick={handleClearSelected} className="h-6 w-6 p-0">
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Patient fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input
                value={newPatient.first_name}
                onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input
                value={newPatient.last_name}
                onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                placeholder="Last name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth *</Label>
              <Input
                type="date"
                value={newPatient.date_of_birth}
                onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sex *</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewPatient({ ...newPatient, sex: 'M' })}
                  className={`flex-1 h-10 rounded-md border text-sm font-medium transition-colors ${
                    newPatient.sex === 'M'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-secondary/50'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => setNewPatient({ ...newPatient, sex: 'F' })}
                  className={`flex-1 h-10 rounded-md border text-sm font-medium transition-colors ${
                    newPatient.sex === 'F'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-secondary/50'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input
                type="tel"
                value={newPatient.whatsapp_number}
                onChange={(e) => setNewPatient({ ...newPatient, whatsapp_number: e.target.value })}
                placeholder="+256 7XX..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chief Complaint</Label>
              <Input
                value={newPatient.chief_complaint}
                onChange={(e) => setNewPatient({ ...newPatient, chief_complaint: e.target.value })}
                placeholder="Reason for visit"
              />
            </div>
          </div>

          <Button
            onClick={handleAddToQueue}
            disabled={addingPatient}
            className="w-full h-11"
            size="lg"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {addingPatient ? 'Adding...' : 'Add to Queue'}
          </Button>
        </div>
      )}

      {/* Queue tabs */}
      <Tabs defaultValue="nurse" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border h-12 bg-background">
          <TabsTrigger value="nurse" className="flex-1 gap-2">
            <UserCheck className="w-4 h-4" />
            Nurse ({nurseTabItems.length})
          </TabsTrigger>
          <TabsTrigger value="doctor" className="flex-1 gap-2">
            <Stethoscope className="w-4 h-4" />
            Doctor ({doctorTabItems.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="flex-1 gap-2">
            <Users className="w-4 h-4" />
            Active ({withDoctor.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1 gap-2">
            <CheckCircle className="w-4 h-4" />
            Done ({completed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nurse" className="p-4 space-y-3 mt-0 overflow-y-auto pb-20">
          {nurseTabItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No patients waiting for nurse</p>
              {!showAddPatient && (
                <Button
                  onClick={() => { setShowAddPatient(true); setAddMessage(null) }}
                  className="mt-4"
                  size="lg"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add First Patient
                </Button>
              )}
            </div>
          ) : (
            nurseTabItems.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="doctor" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {doctorTabItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No patients waiting for doctor</p>
            </div>
          ) : (
            doctorTabItems.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="active" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {withDoctor.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active consultations</p>
            </div>
          ) : (
            withDoctor.map(item => <QueueCard key={item.visit_id} item={item} />)
          )}
        </TabsContent>

        <TabsContent value="done" className="p-4 space-y-3 mt-0 overflow-y-auto">
          {completed.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No completed encounters yet</p>
            </div>
          ) : (
            completed.map(item => <QueueCard key={item.visit_id} item={item} showActions={false} linkTo={`/dashboard/visits/${item.visit_id}`} />)
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky Add Patient button */}
      {!showAddPatient && (
        <div className="sticky bottom-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-8">
          <Button
            onClick={() => { setShowAddPatient(true); setAddMessage(null) }}
            size="lg"
            className="w-full h-12 shadow-lg"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Add Patient
          </Button>
        </div>
      )}
    </div>
  )
}
