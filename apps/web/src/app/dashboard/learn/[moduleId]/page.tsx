import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'

export default async function LearnModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { moduleId } = await params
  const supabase = createServiceClient()

  const { data: moduleRow } = await supabase
    .from('cme_modules')
    .select('id, slug, title, description')
    .eq('id', moduleId)
    .eq('published', true)
    .maybeSingle()

  if (!moduleRow) notFound()

  const [{ data: lessons }, { data: flashcards }, { data: quiz }] = await Promise.all([
    supabase
      .from('cme_lessons')
      .select('id, slug, title, body_markdown, library_slug')
      .eq('module_id', moduleId)
      .order('display_order'),
    supabase
      .from('cme_flashcards')
      .select('id, front_text, back_text')
      .eq('module_id', moduleId)
      .order('display_order'),
    supabase
      .from('cme_quiz_questions')
      .select('id, prompt, choices, correct_index, explanation')
      .eq('module_id', moduleId)
      .order('display_order'),
  ])

  return (
    <div>
      <WebTopBar title={moduleRow.title as string} />
      <div className="p-4 max-w-2xl space-y-6">
        <Link href="/dashboard/learn" className="text-sm text-muted-foreground hover:text-foreground">
          ← All modules
        </Link>
        {moduleRow.description && (
          <p className="text-sm text-muted-foreground">{moduleRow.description as string}</p>
        )}

        {(lessons ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Lessons</h2>
            {(lessons ?? []).map((lesson) => (
              <article
                key={lesson.id as string}
                className="bg-card border border-border rounded-lg p-4 space-y-2"
              >
                <h3 className="font-medium">{lesson.title as string}</h3>
                <p className="text-sm whitespace-pre-wrap text-body">
                  {lesson.body_markdown as string}
                </p>
                {lesson.library_slug && (
                  <Link
                    href={`/library/${lesson.library_slug as string}`}
                    className="text-sm text-cobalt hover:underline"
                  >
                    Open in library →
                  </Link>
                )}
              </article>
            ))}
          </section>
        )}

        {(flashcards ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Flashcards</h2>
            <ul className="space-y-2">
              {(flashcards ?? []).map((card) => (
                <li
                  key={card.id as string}
                  className="bg-muted/50 border border-border rounded-md p-3 text-sm"
                >
                  <p className="font-medium">{card.front_text as string}</p>
                  <p className="text-muted-foreground mt-1">{card.back_text as string}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(quiz ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Quick check</h2>
            {(quiz ?? []).map((q) => {
              const choices = (q.choices as string[]) ?? []
              const correct = choices[q.correct_index as number]
              return (
                <div
                  key={q.id as string}
                  className="bg-card border border-border rounded-lg p-4 space-y-2"
                >
                  <p className="font-medium text-sm">{q.prompt as string}</p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {choices.map((c) => (
                      <li key={c} className={c === correct ? 'text-accent font-medium' : ''}>
                        {c}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && (
                    <p className="text-xs text-muted-foreground">{q.explanation as string}</p>
                  )}
                </div>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
