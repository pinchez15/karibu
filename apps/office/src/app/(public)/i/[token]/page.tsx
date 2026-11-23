import { InvoiceDocument, type InvoiceDoc, type InvoiceSeller } from '@/components/InvoiceDocument'
import { PrintButton } from '@/components/PrintButton'
import { rpcPublic } from '@/lib/db'
import { t } from '@/i18n'

// The clinic opens this from WhatsApp. No login; the token is the key.
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

type Props = { params: Promise<{ token: string }> }

export default async function PublicInvoicePage({ params }: Props) {
  const { token } = await params
  let data: (InvoiceDoc & { office: InvoiceSeller }) | null = null
  try {
    data = await rpcPublic('office_invoice_public', { p_token: token })
  } catch {
    data = null
  }
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-4 px-4 pb-16 pt-5">
      {data ? (
        <>
          <InvoiceDocument invoice={data} seller={data.office} />
          <PrintButton label={t('invoice.print')} />
        </>
      ) : <p className="notice-warning">{t('invoice.invalid')}</p>}
    </main>
  )
}
