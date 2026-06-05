import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'

interface CmeModule {
  id: string
  slug: string
  title: string
  description: string | null
  display_order: number
}

export default async function LearnPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const supabase = createServiceClient()
  const { data: modules, error } = await supabase
    .from('cme_modules')
    .select('id, slug, title, description, display_order')
    .eq('published', true)
    .order('display_order')
    .order('title')

  if (error) {
    return (
      <div>
        <WebTopBar title="Learn" />
        <p className="p-4 text-destructive">Could not load modules: {error.message}</p>
      </div>
    )
  }

  const rows = (modules ?? []) as CmeModule[]

  return (
    <div>
      <WebTopBar title="Learn" />
      <div className="p-4 max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Clinic refresher modules from your evidence library. No AI — read and quiz offline
          when you are back online.
        </p>
        {rows.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
            No published modules yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/dashboard/learn/${m.id}`}
                  className="block bg-card border border-border rounded-lg p-4 hover:border-cobalt/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <GraduationCap className="h-5 w-5 text-cobalt shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-ink">{m.title}</p>
                      {m.description && (
                        <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
