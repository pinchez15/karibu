import Link from 'next/link'

// Mirrors dashboard/visits/[id]/print/PrintBlocker.tsx — an inline error page
// used when the print data is incomplete in a recoverable way (here: trying
// to print a discharge summary for an admission that hasn't been discharged
// yet). Distinct from notFound(), which means "admission doesn't exist or
// isn't yours".
export function PrintBlocker({
  title,
  message,
  ctaHref,
  ctaLabel,
}: {
  title: string
  message: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
        background: '#f3f4f6',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          background: 'white',
          padding: '32px',
          borderRadius: '8px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
          {title}
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          {message}
        </p>
        <Link
          href={ctaHref}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#1E3BAA',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {ctaLabel}
        </Link>
      </div>
    </main>
  )
}
