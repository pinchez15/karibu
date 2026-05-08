import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
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

// Always render fresh — corpus chunks land via the embed script outside
// the build cycle and we want the page to surface them immediately.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

/**
 * Render-time filter for non-clinical chunks (TOC, foreword, disclaimer,
 * page footers like "EMHSLU3"). The chunks stay in the database for AI
 * retrieval — but they're noise to a human reader scrolling the document
 * page, and pdf-parse leaks them in as full sections. Heuristics:
 *   - too short to carry meaning
 *   - dominated by dot leaders (TOC entries with `....14`)
 *   - dominated by digits (page-reference lists)
 *   - section heading matches a known non-clinical bucket
 *   - section heading is a short alphanumeric token (page footer like
 *     "EMHSLU3" or "UCG2023")
 */
const NOISE_HEADING_PATTERNS = [
  'TABLE OF CONTENTS',
  'FOREWORD',
  'PREFACE',
  'ACKNOWLEDGEMENTS',
  'ACKNOWLEDGMENTS',
  'CONTRIBUTORS',
  'TASKFORCE',
  'TASK FORCE',
  'EDITORIAL TEAM',
  'DISCLAIMER',
  'COPYRIGHT',
  'INDEX',
  'BIBLIOGRAPHY',
  'REFERENCES',
  'ABBREVIATIONS',
  'ACRONYMS',
  'LIST OF FIGURES',
  'LIST OF TABLES',
  'PUBLISHED BY',
]

function isLikelyNonClinical(content: string, section: string | null): boolean {
  const text = content.trim()
  if (text.length < 150) return true

  const dotRatio = (text.match(/\./g) ?? []).length / text.length
  if (dotRatio > 0.12) return true // TOC dot leaders dominate

  const digitRatio = (text.match(/\d/g) ?? []).length / text.length
  if (digitRatio > 0.3) return true // page-reference / phone-number dominated

  if (section) {
    const upper = section.toUpperCase()
    if (NOISE_HEADING_PATTERNS.some((h) => upper.includes(h))) return true
    // Page-footer style headings: short single token of letters+digits
    // (e.g. "EMHSLU3", "UCG2023") that pdf-parse mis-detects as section.
    if (/^[A-Z]{2,8}\d*$/.test(section.trim().replace(/\s+/g, ''))) return true
  }

  return false
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { slug } = await params
  const result = await getDocument(slug)
  if (!result) notFound()
  const { doc, chunks } = result

  // Filter front-matter / TOC / page-footer chunks before grouping. The
  // chunks remain in the DB for AI retrieval; only the public reading
  // experience is cleaned up.
  const visibleChunks = chunks.filter((c) => !isLikelyNonClinical(c.content, c.section))

  // Group chunks by section so we render section headings once.
  const sections: Array<{
    section: string | null
    anchor: string | null
    chunks: ChunkRow[]
  }> = []
  for (const chunk of visibleChunks) {
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
                  download
                  className="inline-flex items-center gap-1.5 bg-cobalt text-white rounded-md px-3 py-2 text-sm font-semibold hover:bg-cobalt-deep transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download original PDF
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* Body */}
        {sections.length === 0 ? (
          <div className="mt-8 bg-card border border-border rounded-xl p-5 text-sm text-body">
            {chunks.length === 0 ? (
              <p className="italic">This document hasn't been content-loaded yet.</p>
            ) : (
              <>
                <p>
                  This document's content is mostly tables, drug listings, or other
                  structured data that doesn't reflow well outside the original PDF.
                </p>
                <p className="mt-2">
                  Tap <strong>Download original PDF</strong> above to read it in its
                  intended layout. Karibu's AI retrieves the full content of this
                  document when reviewing clinician notes.
                </p>
              </>
            )}
          </div>
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
