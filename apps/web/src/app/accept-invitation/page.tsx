import type { Metadata } from 'next'
import { AcceptInvitationClient } from './AcceptInvitationClient'

export const metadata: Metadata = {
  title: 'Accept invitation — KaribuEHR',
}

export default function AcceptInvitationPage() {
  return <AcceptInvitationClient />
}
