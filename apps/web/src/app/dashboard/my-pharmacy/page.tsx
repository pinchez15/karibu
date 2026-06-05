import { redirect } from 'next/navigation'

/** Legacy route — unified under Orders. */
export default function MyPharmacyPage() {
  redirect('/dashboard/orders?tab=pharmacy')
}
