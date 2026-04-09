import Link from 'next/link'

export default function PrintNotFound() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
      background: '#f3f4f6',
    }}>
      <div style={{
        maxWidth: '420px',
        background: 'white',
        padding: '32px',
        borderRadius: '8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
          No patient note to print
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          This visit doesn&apos;t have an approved patient note yet. Approve it from the
          review queue first, then come back here to print.
        </p>
        <Link
          href="/dashboard/review"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#059669',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          Go to review queue
        </Link>
      </div>
    </main>
  )
}
