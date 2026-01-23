import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Link Invalid or Expired
        </h1>

        <p className="text-gray-600 mb-6">
          This link may have expired or is no longer valid.
          Please contact your clinic or request a new link via WhatsApp.
        </p>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Need a new link?</h2>
          <p className="text-sm text-gray-600 mb-4">
            Send a message to your clinic's WhatsApp number with the word "notes"
            to receive a new link to your visit summary.
          </p>
        </div>
      </div>
    </main>
  )
}
