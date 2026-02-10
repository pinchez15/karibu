import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface PatientNoteData {
  clinic_name: string
  visit_date: string
  patient_name: string | null
  content: string
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
}

async function getPatientNote(token: string): Promise<PatientNoteData | null> {
  const supabase = getSupabaseClient()

  // Get magic link and verify it's valid
  const { data: magicLink, error: magicLinkError } = await supabase
    .from('magic_links')
    .select('*, visit:visits(*, patient:patients(*), clinic:clinics(name)), patient_note:patient_notes(*)')
    .eq('token', token)
    .single()

  if (magicLinkError || !magicLink) {
    return null
  }

  // Check if expired
  if (new Date(magicLink.expires_at) < new Date()) {
    return null
  }

  // Mark as used if first access
  if (!magicLink.used_at) {
    await supabase
      .from('magic_links')
      .update({ used_at: new Date().toISOString() })
      .eq('id', magicLink.id)
  }

  // Audit log: patient note accessed via magic link (DPPA compliance)
  try {
    await supabase.from('audit_logs').insert({
      actor_type: 'patient',
      action: 'patient_note_viewed',
      resource_type: 'patient_note',
      resource_id: magicLink.visit_id,
      patient_id: magicLink.patient_id,
      metadata: { access_method: 'magic_link', first_access: !magicLink.used_at },
    })
  } catch { /* fire-and-forget */ }

  const visit = magicLink.visit as any
  const patientNote = visit?.patient_note || (magicLink as any).patient_note

  if (!visit || !patientNote) {
    return null
  }

  return {
    clinic_name: visit.clinic?.name || 'Karibu Health',
    visit_date: visit.visit_date,
    patient_name: visit.patient?.display_name || null,
    content: patientNote.content || '',
    diagnosis: visit.diagnosis,
    medications: visit.medications,
    follow_up_instructions: visit.follow_up_instructions,
    tests_ordered: visit.tests_ordered,
  }
}

export default async function PatientNotePage({
  params,
}: {
  params: { token: string }
}) {
  const note = await getPatientNote(params.token)

  if (!note) {
    notFound()
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <header className="bg-card border border-border rounded-lg p-6 mb-4">
          <h1 className="text-2xl font-bold text-primary mb-1">
            {note.clinic_name}
          </h1>
          <p className="text-muted-foreground">Visit Summary</p>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">Visit Date</p>
            <p className="text-lg font-medium">{formatDate(note.visit_date)}</p>
            {note.patient_name && (
              <>
                <p className="text-sm text-muted-foreground mt-2">Patient</p>
                <p className="font-medium">{note.patient_name}</p>
              </>
            )}
          </div>
        </header>

        {/* Main Content */}
        <section className="bg-card border border-border rounded-lg p-6 mb-4">
          <h2 className="text-lg font-semibold mb-4">
            Your Visit Summary
          </h2>
          <div className="space-y-3">
            {note.content.split('\n').map((paragraph, index) => (
              <p key={index} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* Structured Data Sections */}
        {note.diagnosis && (
          <section className="bg-card border border-border rounded-lg p-6 mb-4">
            <h2 className="text-lg font-semibold mb-2 flex items-center">
              <span className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              What We Found
            </h2>
            <p className="ml-11">{note.diagnosis}</p>
          </section>
        )}

        {note.medications && (
          <section className="bg-card border border-border rounded-lg p-6 mb-4">
            <h2 className="text-lg font-semibold mb-2 flex items-center">
              <span className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </span>
              Your Medications
            </h2>
            <div className="ml-11 bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              {note.medications.split('\n').map((med, index) => (
                <p key={index} className="mb-1">{med}</p>
              ))}
            </div>
          </section>
        )}

        {note.follow_up_instructions && (
          <section className="bg-card border border-border rounded-lg p-6 mb-4">
            <h2 className="text-lg font-semibold mb-2 flex items-center">
              <span className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              Next Steps
            </h2>
            <div className="ml-11">
              {note.follow_up_instructions.split('\n').map((instruction, index) => (
                <p key={index} className="mb-2 flex items-start">
                  <span className="text-primary mr-2">&#8226;</span>
                  {instruction}
                </p>
              ))}
            </div>
          </section>
        )}

        {note.tests_ordered && (
          <section className="bg-card border border-border rounded-lg p-6 mb-4">
            <h2 className="text-lg font-semibold mb-2 flex items-center">
              <span className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </span>
              Tests Ordered
            </h2>
            <p className="ml-11">{note.tests_ordered}</p>
          </section>
        )}

        {/* Warning Signs */}
        <section className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            When to Seek Help
          </h2>
          <p className="text-red-700 text-sm">
            Return to the clinic or seek emergency care if you experience:
          </p>
          <ul className="mt-2 text-red-700 text-sm space-y-1">
            <li>&#8226; High fever that doesn&apos;t improve</li>
            <li>&#8226; Severe or worsening symptoms</li>
            <li>&#8226; Difficulty breathing</li>
            <li>&#8226; Any symptoms that concern you</li>
          </ul>
        </section>

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground py-4">
          <p className="mb-2">Questions? Contact your clinic.</p>
          <p>This summary was generated by Karibu Health</p>
        </footer>
      </div>
    </main>
  )
}
