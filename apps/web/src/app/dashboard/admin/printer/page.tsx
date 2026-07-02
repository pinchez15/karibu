import { redirect } from 'next/navigation'

/** Legacy URL — printer setup moved to Settings for all staff roles. */
export default function LegacyAdminPrinterRedirect() {
  redirect('/dashboard/settings/printer')
}
