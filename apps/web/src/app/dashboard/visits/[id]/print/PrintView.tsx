'use client'

import { useEffect } from 'react'

interface PrintVisit {
  id: string
  visit_date: string
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  patient_notes: { content: string | null } | null
  doctor: { display_name: string } | null
  clinic: {
    name: string
    phone: string | null
    umdpc_number: string | null
    timezone: string
  } | null
}

// Receipt is 58mm wide. At ~10pt monospace that's roughly 32 characters per
// line. Every horizontal rule, every section header, every wrapped line of
// the patient note has to fit. Keep sections short, use ASCII separators
// instead of CSS borders (thermal printers render bitmap rules unevenly).
const RECEIPT_WIDTH_CHARS = 32

const HR_HEAVY = '='.repeat(RECEIPT_WIDTH_CHARS)
const HR_LIGHT = '-'.repeat(RECEIPT_WIDTH_CHARS)

// Center a label inside a horizontal rule of dashes, e.g. "----- DIAGNOSIS -----"
function sectionRule(label: string): string {
  const inner = ` ${label} `
  const remaining = RECEIPT_WIDTH_CHARS - inner.length
  if (remaining <= 0) return inner.slice(0, RECEIPT_WIDTH_CHARS)
  const left = Math.floor(remaining / 2)
  const right = remaining - left
  return '-'.repeat(left) + inner + '-'.repeat(right)
}

// Strip markdown the LLM occasionally emits despite being told not to.
// Removes **bold**, *italic*, `code`, and leading # headers.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}

// Format a patient name for the receipt. Prefer first + last initial to keep
// it short ("Grace N.") but fall back to display_name or "Patient".
function formatPatientName(p: PrintVisit['patient']): string {
  if (!p) return 'Patient'
  const first = p.first_name?.trim()
  const last = p.last_name?.trim()
  if (first && last) return `${first} ${last.charAt(0)}.`
  if (first) return first
  if (last) return last
  if (p.display_name) return p.display_name
  return 'Patient'
}

// Format a doctor name as "Dr. <First> <LastInitial>." for compactness.
function formatDoctorName(d: PrintVisit['doctor']): string {
  if (!d?.display_name) return 'Not recorded'
  const parts = d.display_name.trim().split(/\s+/)
  if (parts.length === 1) return `Dr. ${parts[0]}`
  return `Dr. ${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
}

export function PrintView({ visit }: { visit: PrintVisit }) {
  useEffect(() => {
    // Auto-fire the print dialog after first paint. On thermal printers the
    // receipt is so short that the cost of a misfire (one wasted re-print) is
    // far less than the cost of nurse time waiting on a preview. See
    // /plan-design-review 2026-04-09 — auto-print is correct in this context.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const patientName = formatPatientName(visit.patient)
  const doctorName = formatDoctorName(visit.doctor)

  const visitDate = new Date(visit.visit_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const clinicName = visit.clinic?.name || 'Karibu Health'
  const clinicPhone = visit.clinic?.phone
  const clinicUmdpc = visit.clinic?.umdpc_number
  const noteContent = stripMarkdown(visit.patient_notes?.content || '')

  // Document ID: KH-<patient_id>-<YYYYMMDD> for chain-of-custody and
  // patient self-reference. Falls back to visit UUID prefix if no patient_id.
  const visitDateForId = visit.visit_date.slice(0, 10).replace(/-/g, '')
  const docId = visit.patient?.patient_id != null
    ? `KH-${visit.patient.patient_id}-${visitDateForId}`
    : `KH-${visit.id.slice(0, 8)}-${visitDateForId}`

  return (
    <>
      <style>{`
        /* Thermal printer page setup. 58mm wide, auto height (receipt scrolls).
           2mm margin works on most ESC/POS printers; some need 0. */
        @page { size: 58mm auto; margin: 2mm; }

        @media screen {
          /* Screen preview shows the receipt as a centered "paper" so staff
             can see what will print. Mobile-friendly: shrinks to viewport. */
          body {
            background: #f3f4f6;
            margin: 0;
            font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace;
          }
          .receipt {
            max-width: 320px;
            margin: 16px auto;
            padding: 16px;
            background: white;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            border-radius: 4px;
          }
          .toolbar {
            max-width: 320px;
            margin: 16px auto 0;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-family: system-ui, sans-serif;
          }
          .toolbar button {
            padding: 12px 20px;
            background: #1E3BAA;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            min-height: 44px;
          }
          .toolbar button.secondary {
            background: white;
            color: #111827;
            border: 1px solid #d1d5db;
          }
          .preview-note {
            max-width: 320px;
            margin: 8px auto 16px;
            padding: 8px 12px;
            font-family: system-ui, sans-serif;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        }

        @media print {
          body { background: white; margin: 0; }
          .toolbar, .preview-note { display: none !important; }
          .receipt {
            margin: 0;
            padding: 0;
            box-shadow: none;
            border-radius: 0;
            max-width: none;
          }
        }

        .receipt {
          font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.35;
          color: #000;
          white-space: pre;
        }
        .receipt .center { text-align: center; }
        .receipt .bold { font-weight: 700; }
        .receipt .block { white-space: pre-wrap; }
        .receipt section { page-break-inside: avoid; }
      `}</style>

      <div className="toolbar">
        <button className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="preview-note">
        Preview at 58mm receipt width. Printing happens automatically.
      </div>

      <div className="receipt" lang="en">
        {/* Letterhead */}
        <section>
          <div className="center bold">{clinicName.toUpperCase()}</div>
          {clinicPhone && <div className="center">{clinicPhone}</div>}
          {clinicUmdpc && <div className="center">UMDPC #{clinicUmdpc}</div>}
        </section>

        <div>{HR_HEAVY}</div>
        <div className="center bold">VISIT SUMMARY</div>
        <div className="center">{visitDate}</div>
        <div>{HR_HEAVY}</div>

        {/* Patient + doctor block */}
        <section>
          <div>Patient: {patientName}</div>
          {visit.patient?.patient_id != null && (
            <div>ID:      #{visit.patient.patient_id}</div>
          )}
          <div>Doctor:  {doctorName}</div>
        </section>

        {/* Diagnosis */}
        {visit.diagnosis && visit.diagnosis.trim() && (
          <>
            <div>{'\n' + sectionRule('DIAGNOSIS')}</div>
            <section>
              <div className="block">{visit.diagnosis.trim()}</div>
            </section>
          </>
        )}

        {/* Medications */}
        {visit.medications && visit.medications.trim() && (
          <>
            <div>{'\n' + sectionRule('MEDICATIONS')}</div>
            <section>
              <div className="block">{visit.medications.trim()}</div>
            </section>
          </>
        )}

        {/* Tests ordered */}
        {visit.tests_ordered && visit.tests_ordered.trim() && (
          <>
            <div>{'\n' + sectionRule('TESTS')}</div>
            <section>
              <div className="block">{visit.tests_ordered.trim()}</div>
            </section>
          </>
        )}

        {/* Follow-up */}
        {visit.follow_up_instructions && visit.follow_up_instructions.trim() && (
          <>
            <div>{'\n' + sectionRule('FOLLOW UP')}</div>
            <section>
              <div className="block">{visit.follow_up_instructions.trim()}</div>
            </section>
          </>
        )}

        {/* AI-generated friendly explanation */}
        {noteContent && (
          <>
            <div>{'\n' + HR_LIGHT}</div>
            <section>
              <div className="block">{noteContent}</div>
            </section>
            <div>{HR_LIGHT}</div>
          </>
        )}

        {/* "Worse?" callout — the most important thing on the page */}
        {clinicPhone && (
          <section>
            <div>{'\n' + sectionRule('WORSE?')}</div>
            <div>If your symptoms get</div>
            <div>worse, call us right</div>
            <div>away:</div>
            <div className="center bold">{clinicPhone}</div>
          </section>
        )}

        {/* Footer: document ID + print timestamp */}
        <div>{'\n' + HR_HEAVY}</div>
        <section>
          <div className="center">{docId}</div>
          <div className="center">Printed {printedAt}</div>
        </section>
        <div>{'\n\n\n'}</div>
      </div>
    </>
  )
}
