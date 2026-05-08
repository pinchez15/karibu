import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase'
import { KaribuLockup } from '@/components/karibu-mark'

/**
 * Public evidence library index. Renders the published medical_documents
 * grouped by topic. The library is the source-of-truth that Karibu's AI
 * review references — when AI suggests "Should we check X?" the citation
 * links to the exact chunk in this library.
 *
 * No auth required; the page is part of the case for clinical credibility.
 */

const TOPIC_LABELS: Record<string, { label: string; blurb: string }> = {
  malaria: {
    label: 'Malaria',
    blurb: 'Diagnosis, RDT vs microscopy, uncomplicated and severe treatment, pregnancy.',
  },
  hiv_tb: {
    label: 'HIV & TB',
    blurb: 'Testing, ART regimens, TB co-infection, prevention of mother-to-child transmission.',
  },
  maternal_anc: {
    label: 'Maternal & ANC',
    blurb: 'Antenatal care contacts, danger signs, hypertensive disorders, postpartum care.',
  },
  child_health: {
    label: 'Child health',
    blurb: 'IMCI, growth, immunization, common pediatric presentations under five.',
  },
  ncd: {
    label: 'Non-communicable disease',
    blurb: 'Hypertension, diabetes, cardiovascular risk, stable management at HC III.',
  },
  mental_health: {
    label: 'Mental health',
    blurb: 'Common presentations, brief interventions, when to refer up the system.',
  },
  emergency: {
    label: 'Emergency',
    blurb: 'Triage, stabilization, when to transfer. Limited HC III emergency resources in mind.',
  },
  imci: {
    label: 'IMCI',
    blurb: 'WHO Integrated Management of Childhood Illness — under-five algorithms.',
  },
  pharmacology: {
    label: 'Pharmacology',
    blurb: 'Dosing, contraindications, adverse effects for HC III essential medicines.',
  },
  guidelines_general: {
    label: 'General guidelines',
    blurb: 'Cross-cutting Uganda Clinical Guidelines and HC III service standards.',
  },
}

interface DocumentRow {
  slug: string
  title: string
  topic: string
  source_org: string | null
  source_year: number | null
  summary: string | null
  reviewers: string[]
  last_reviewed_at: string | null
}

async function getDocuments(): Promise<DocumentRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('medical_documents')
    .select('slug, title, topic, source_org, source_year, summary, reviewers, last_reviewed_at')
    .eq('is_published', true)
    .order('topic')
    .order('title')

  if (error) {
    console.error('Failed to load library documents:', error)
    return []
  }
  return (data ?? []) as DocumentRow[]
}

export const metadata = {
  title: 'Evidence library — Karibu Health',
  description:
    'The medical references Karibu Health AI uses to check clinicians\' work. Uganda HC III treatment guidelines, WHO IMCI, national protocols.',
}

export default async function LibraryPage() {
  const documents = await getDocuments()

  // Group by topic.
  const byTopic = documents.reduce<Record<string, DocumentRow[]>>((acc, doc) => {
    if (!acc[doc.topic]) acc[doc.topic] = []
    acc[doc.topic].push(doc)
    return acc
  }, {})

  const orderedTopics = Object.keys(TOPIC_LABELS).filter((t) => byTopic[t]?.length)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <KaribuLockup size={28} />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-cobalt hover:text-cobalt-deep"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="kh-meta mb-3 text-cobalt">EVIDENCE LIBRARY</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">
            What Karibu's AI reads.
          </h1>
          <p className="text-lg text-body leading-relaxed max-w-2xl">
            The clinician is the medical authority on every visit. Our AI runs a quiet check
            in the background and asks a question only when it would disagree — citing the exact
            evidence below. Every reference links back to the source.
          </p>
          <p className="text-sm text-muted-foreground mt-4 max-w-2xl">
            Curated for Uganda Health Centre III service standards. WHO and Ugandan Ministry of
            Health protocols, reviewed by Uganda-licensed clinicians.
          </p>
        </div>
      </section>

      {/* Library */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        {documents.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Library is being seeded</h2>
            <p className="text-body max-w-md mx-auto">
              The first batch of references is in editorial review. New documents are added to
              the library only after a Uganda-licensed clinician signs off. Check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {orderedTopics.map((topic) => {
              const meta = TOPIC_LABELS[topic]
              const docs = byTopic[topic]
              return (
                <div key={topic}>
                  <div className="mb-4">
                    <div className="kh-meta mb-1.5">{meta.label.toUpperCase()}</div>
                    <p className="text-sm text-body">{meta.blurb}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {docs.map((doc) => (
                      <Link
                        key={doc.slug}
                        href={`/library/${doc.slug}`}
                        className="bg-card border border-border rounded-xl p-4 hover:border-cobalt/40 transition-colors group"
                      >
                        <h3 className="font-semibold text-ink group-hover:text-cobalt transition-colors">
                          {doc.title}
                        </h3>
                        {doc.summary && (
                          <p className="text-sm text-body mt-1.5 leading-relaxed">{doc.summary}</p>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-line-soft">
                          <div className="kh-meta">
                            {doc.source_org}
                            {doc.source_year ? ` · ${doc.source_year}` : ''}
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-cobalt" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>Karibu Health · Evidence library</span>
          <span>Open reference. Not a substitute for clinical judgement.</span>
        </div>
      </footer>
    </div>
  )
}
