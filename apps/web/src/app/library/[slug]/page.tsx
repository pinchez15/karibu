import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase'
import { KaribuLockup } from '@/components/karibu-mark'

/**
 * Public document page — renders a published medical_document with all its
 * chunks, grouped by section. Section headings get URL anchors so AI
 * citations like "/library/uganda-malaria-2024#section-4-2" land on the
 * exact paragraph the model retrieved.
 */

interface DocumentRow {
  id: number
  slug: string
  title: string
  topic: string
  source_org: string | null
  source_year: number | null
  source_url: string | null
  summary: string | null
  reviewers: string[]
  last_reviewed_at: string | null
}

interface ChunkRow {
  id: number
  section: string | null
  section_anchor: string | null
  chunk_index: number
  content: string
}

interface DocumentPageProps {
  params: Promise<{ slug: string }>
}

async function getDocument(
  slug: string,
): Promise<{ doc: DocumentRow; chunks: ChunkRow[] } | null> {
  const supabase = createServiceClient()

  const { data: doc, error } = await supabase
    .from('medical_documents')
    .select(
      'id, slug, title, topic, source_org, source_year, source_url, summary, reviewers, last_reviewed_at',
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (error || !doc) return null

  const { data: chunks } = await supabase
    .from('medical_corpus')
    .select('id, section, section_anchor, chunk_index, content')
    .eq('document_id', doc.id)
    .order('chunk_index', { ascending: true })

  return { doc: doc as DocumentRow, chunks: (chunks ?? []) as ChunkRow[] }
}

export async function generateMetadata({ params }: DocumentPageProps) {
  const { slug } = await params
  const result = await getDocument(slug)
  if (!result) return { title: 'Document not found — Karibu Health' }
  const { doc } = result
  return {
    title: `${doc.title} — Karibu Evidence Library`,
    description: doc.summary ?? undefined,
  }
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { slug } = await params
  const result = await getDocument(slug)
  if (!result) notFound()
  const { doc, chunks } = result

  // Group chunks by section so we render section headings once.
  const sections: Array<{
    section: string | null
    anchor: string | null
    chunks: ChunkRow[]
  }> = []
  for (const chunk of chunks) {
    const last = sections[sections.length - 1]
    if (last && last.section === chunk.section) {
      last.chunks.push(chunk)
    } else {
      sections.push({
        section: chunk.section,
        anchor: chunk.section_anchor,
        chunks: [chunk],
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <KaribuLockup size={28} />
          </Link>
          <Link
            href="/library"
            className="text-sm font-medium text-cobalt hover:text-cobalt-deep inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Library
          </Link>
        </div>
      </header>

      {/* Document title */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <div className="kh-meta mb-3 text-cobalt">{doc.topic.replace(/_/g, ' ').toUpperCase()}</div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink mb-3">
          {doc.title}
        </h1>
        {doc.summary && <p className="text-base text-body leading-relaxed">{doc.summary}</p>}

        {/* Provenance card */}
        <aside className="mt-6 bg-card border border-border rounded-xl p-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
            {doc.source_org && (
              <div>
                <div className="kh-meta">SOURCE</div>
                <div className="text-body mt-0.5">
                  {doc.source_org}
                  {doc.source_year ? `, ${doc.source_year}` : ''}
                </div>
              </div>
            )}
            {doc.last_reviewed_at && (
              <div>
                <div className="kh-meta">LAST REVIEWED</div>
                <div className="text-body mt-0.5 font-mono text-[12px]">
                  {new Date(doc.last_reviewed_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
            {doc.reviewers.length > 0 && (
              <div className="sm:col-span-2">
                <div className="kh-meta">REVIEWERS</div>
                <div className="text-body mt-0.5">{doc.reviewers.join(' · ')}</div>
              </div>
            )}
            {doc.source_url && (
              <div className="sm:col-span-2">
                <a
                  href={doc.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cobalt hover:text-cobalt-deep inline-flex items-center gap-1.5 text-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Original source
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* Body */}
        {sections.length === 0 ? (
          <p className="mt-8 text-body italic">This document hasn't been content-loaded yet.</p>
        ) : (
          <div className="mt-10 space-y-10">
            {sections.map((sec, i) => (
              <section
                key={`${sec.section ?? 'intro'}-${i}`}
                id={sec.anchor ?? undefined}
                className="scroll-mt-20"
              >
                {sec.section && (
                  <h2 className="text-xl md:text-2xl font-semibold text-ink mb-3 tracking-tight">
                    {sec.section}
                  </h2>
                )}
                <div className="space-y-4 text-base text-body leading-relaxed">
                  {sec.chunks.map((c) => (
                    <p key={c.id} className="whitespace-pre-wrap">
                      {c.content}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </article>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>Karibu Health · Evidence library</span>
          <span>Open reference. Not a substitute for clinical judgement.</span>
        </div>
      </footer>
    </div>
  )
}
