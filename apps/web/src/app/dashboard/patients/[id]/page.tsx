import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  recording: { label: 'Recording', color: 'text-amber-700', bg: 'bg-amber-100' },
  uploading: { label: 'Uploading', color: 'text-sky-700', bg: 'bg-sky-100' },
  processing: { label: 'Processing', color: 'text-violet-700', bg: 'bg-violet-100' },
  review: { label: 'Review', color: 'text-primary', bg: 'bg-secondary' },
  sent: { label: 'Sent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  completed: { label: 'Completed', color: 'text-muted-foreground', bg: 'bg-muted' },
  error: { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' },
}

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { id: patientId } = await params
  const supabase = createServiceClient()

  // Fetch patient info
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .single()

  if (patientError || !patient) {
    redirect('/dashboard/visits')
  }

  // Fetch all visits for this patient with notes
  const { data: visits } = await supabase
    .from('visits')
    .select(`
      id, visit_date, status, chief_complaint, diagnosis, review_status,
      doctor:staff!visits_doctor_id_fkey(display_name),
      provider_notes(id, note_content, status),
      patient_notes(id, content, status)
    `)
    .eq('patient_id', patientId)
    .eq('clinic_id', staff.clinic_id)
    .order('visit_date', { ascending: false })

  const visitList = (visits || []) as unknown as Array<{
    id: string
    visit_date: string
    status: string
    chief_complaint: string | null
    diagnosis: string | null
    review_status: string | null
    doctor: { display_name: string } | null
    provider_notes: { id: string; note_content: string | null; status: string } | null
    patient_notes: { id: string; content: string | null; status: string } | null
  }>

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <Link href="/dashboard/visits">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Patients
        </Button>
      </Link>

      {/* Patient header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-xl font-bold">
          {patient.display_name || 'Unknown Patient'}
        </h2>
        <p className="text-muted-foreground font-mono">{patient.whatsapp_number}</p>
        {patient.date_of_birth && (
          <p className="text-sm text-muted-foreground mt-1">
            DOB: {new Date(patient.date_of_birth).toLocaleDateString()}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          {visitList.length} visit{visitList.length !== 1 ? 's' : ''} on record
        </p>
      </div>

      {/* Visit timeline */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Visit History</h3>

        {visitList.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No visits recorded</p>
        ) : (
          visitList.map((visit, index) => {
            const config = statusConfig[visit.status] || statusConfig.error
            const hasSOAP = !!visit.provider_notes?.note_content
            const hasPatientNote = !!visit.patient_notes?.content

            return (
              <div key={visit.id} className="relative">
                {/* Timeline connector */}
                {index < visitList.length - 1 && (
                  <div className="absolute left-[19px] top-12 bottom-0 w-0.5 bg-border" />
                )}

                <div className="flex gap-3">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 mt-1">
                    <div className={`w-[10px] h-[10px] rounded-full border-2 ${
                      visit.status === 'sent' || visit.status === 'completed'
                        ? 'bg-emerald-500 border-emerald-600'
                        : visit.status === 'error'
                        ? 'bg-red-500 border-red-600'
                        : 'bg-primary border-primary'
                    }`} />
                  </div>

                  {/* Visit card */}
                  <Link
                    href={`/dashboard/visits/${visit.id}`}
                    className="flex-1 bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-medium">
                          {new Date(visit.visit_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {visit.doctor?.display_name || 'Unassigned'}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>

                    {visit.chief_complaint && (
                      <p className="text-sm text-muted-foreground mb-2">
                        CC: {visit.chief_complaint}
                      </p>
                    )}

                    {visit.diagnosis && (
                      <p className="text-sm font-medium mb-2">
                        Dx: {visit.diagnosis}
                      </p>
                    )}

                    {/* Note indicators */}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {hasSOAP && (
                        <span className="text-emerald-600">SOAP note ✓</span>
                      )}
                      {hasPatientNote && (
                        <span className="text-blue-600">Patient note ✓</span>
                      )}
                    </div>
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
