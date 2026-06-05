import { redirect } from 'next/navigation'

/** Legacy route — unified under Orders. */
export default function MyLabsPage() {
  redirect('/dashboard/orders?tab=labs')
}
