'use client'

import { useEffect } from 'react'

interface PrintVisit {
  id: string
  visit_date: string
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  patient_notes: { content: string | null } | null
  clinic: { name: string; slug: string; timezone: string } | null
}

export function PrintView({ visit }: { visit: PrintVisit }) {
  useEffect(() => {
    // Auto-trigger the browser print dialog after the page renders
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [])

  const patientName =
    [visit.patient?.first_name, visit.patient?.last_name].filter(Boolean).join(' ') ||
    visit.patient?.display_name ||
    'Patient'

  const visitDate = new Date(visit.visit_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const clinicName = visit.clinic?.name || 'Karibu Health'
  const noteContent = visit.patient_notes?.content || ''

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
        @media screen {
          body { background: #f3f4f6; }
          .print-sheet {
            max-width: 210mm;
            margin: 24px auto;
            padding: 24mm;
            background: white;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          }
          .print-toolbar {
            max-width: 210mm;
            margin: 16px auto 0;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
          .print-toolbar button {
            padding: 8px 16px;
            background: #059669;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          }
          .print-toolbar button.secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
          }
        }
        @media print {
          body { background: white; }
          .print-toolbar { display: none !important; }
          .print-sheet { box-shadow: none; padding: 0; margin: 0; max-width: none; }
        }
        .print-sheet { font-family: Georgia, 'Times New Roman', serif; color: #111827; }
        .letterhead {
          border-bottom: 2px solid #059669;
          padding-bottom: 12px;
          margin-bottom: 24px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .letterhead h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          color: #059669;
          letter-spacing: 0.5px;
        }
        .letterhead .tagline {
          font-size: 11px;
          color: #6b7280;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .visit-header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 24px;
          margin-bottom: 24px;
          font-size: 13px;
        }
        .visit-header dt { color: #6b7280; font-weight: 400; }
        .visit-header dd { margin: 0; font-weight: 600; color: #111827; }
        .note-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid #e5e7eb;
        }
        .note-content {
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
          font-family: Georgia, 'Times New Roman', serif;
        }
        .footer {
          margin-top: 36px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
        }
      `}</style>

      <div className="print-toolbar">
        <button className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <div className="print-sheet">
        <header className="letterhead">
          <h1>{clinicName}</h1>
          <span className="tagline">Patient Visit Summary</span>
        </header>

        <dl className="visit-header">
          <dt>Patient</dt>
          <dd>{patientName}</dd>
          {visit.patient?.patient_id != null && (
            <>
              <dt>Patient ID</dt>
              <dd>#{visit.patient.patient_id}</dd>
            </>
          )}
          <dt>Visit Date</dt>
          <dd>{visitDate}</dd>
        </dl>

        <h2 className="note-title">Your visit notes</h2>
        <div className="note-content">{noteContent}</div>

        <div className="footer">
          Issued by {clinicName} &middot; Keep this document for your records
        </div>
      </div>
    </>
  )
}
