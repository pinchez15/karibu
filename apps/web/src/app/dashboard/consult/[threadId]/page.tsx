import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { ConsultChatClient, type ConsultMessage } from './ConsultChatClient'

export default async function ConsultThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { threadId } = await params
  const supabase = createServiceClient()

  const { data: thread } = await supabase
    .from('consult_threads')
    .select('id, visit_id, clinic_id, status, visit:visits(documentation_complete)')
    .eq('id', threadId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (!thread) notFound()

  const visit = Array.isArray(thread.visit) ? thread.visit[0] : thread.visit
  const readOnly = !!(visit as { documentation_complete?: boolean } | null)?.documentation_complete

  const { data: messageRows } = await supabase
    .from('consult_messages')
    .select('id, role, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  const initialMessages: ConsultMessage[] = (messageRows ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as ConsultMessage['role'],
    content: m.content as string,
    created_at: m.created_at as string,
  }))

  return (
    <div>
      <WebTopBar title="Consult" />
      <div className="p-4 max-w-2xl space-y-4">
        <Link
          href={`/dashboard/visits/${thread.visit_id as string}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to visit
        </Link>
        <Link href="/dashboard/consult" className="text-sm text-cobalt hover:underline block">
          All consult threads
        </Link>
        <ConsultChatClient
          threadId={threadId}
          initialMessages={initialMessages}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
