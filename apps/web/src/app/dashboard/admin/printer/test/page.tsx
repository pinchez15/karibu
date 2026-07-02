import { redirect } from 'next/navigation'

/** Legacy URL — test receipt moved under Settings. */
export default function LegacyAdminPrinterTestRedirect() {
  redirect('/dashboard/settings/printer/test')
}
