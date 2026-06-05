import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'

export default async function ConsultListPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const supabase = createServiceClient()
  const { data: threads, error } = await supabase
    .from('consult_threads')
    .select('id, visit_id, status, updated_at, visit:visits(documentation_complete, visit_date, patient:patients(display_name))')
    .eq('clinic_id', staff.clinic_id)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    return (
      <div>
        <WebTopBar title="Consult" />
        <p className="p-4 text-destructive">{error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <WebTopBar title="Consult" />
      <div className="p-4 max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          De-identified second opinion per visit. Requires network; never includes patient names.
        </p>
        {(threads ?? []).length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
            No consult threads yet. Open a visit and choose &quot;Send to consult&quot;.
          </div>
        ) : (
          <ul className="space-y-2">
            {(threads ?? []).map((t) => {
              const visit = Array.isArray(t.visit) ? t.visit[0] : t.visit
              const readOnly = !!(visit as { documentation_complete?: boolean } | null)
                ?.documentation_complete
              return (
                <li key={t.id as string}>
                  <Link
                    href={`/dashboard/consult/${t.id as string}`}
                    className="block bg-card border border-border rounded-lg p-4 hover:border-cobalt/40"
                  >
                    <p className="font-medium">
                      Visit {new Date((visit?.visit_date as string) ?? '').toLocaleDateString('en-GB')}
                      {readOnly ? ' · read-only' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Updated {new Date(t.updated_at as string).toLocaleString('en-GB')}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
