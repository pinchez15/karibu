'use client'

export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn-primary no-print w-full" onClick={() => window.print()}>{label}</button>
}
