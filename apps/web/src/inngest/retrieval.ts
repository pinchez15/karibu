import { createServiceClient } from '@/lib/supabase'
import { openai } from './openai'

/**
 * Retrieval-augmented generation for the clinician-note review function.
 * Embeds the clinician's note + chief complaint + vitals, retrieves the
 * top-N most similar chunks from medical_corpus, and returns them with
 * their document metadata for citation.
 *
 * The AI prompt is constrained to cite only the IDs we hand it; any
 * citation outside this set fails validation and the suggestion is
 * dropped (no hallucinated study names ever reach the clinician).
 */

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

export interface RetrievedChunk {
  id: number
  document_id: number
  document_title: string
  document_slug: string
  source_org: string | null
  source_year: number | null
  section: string | null
  section_anchor: string | null
  content: string
  // Cosine distance — lower is more similar.
  distance: number
}

export async function retrieveRelevantChunks(opts: {
  clinicianNote: string
  chiefComplaint?: string | null
  vitalsBlurb?: string | null
  limit?: number
}): Promise<RetrievedChunk[]> {
  const { clinicianNote, chiefComplaint, vitalsBlurb, limit = 6 } = opts

  // Compose the query. Keep it short — text-embedding-3-small caps at 8k
  // tokens but quality degrades with verbose queries; the case is what
  // matters, not the prose.
  const query = [
    chiefComplaint ? `Chief complaint: ${chiefComplaint}` : null,
    vitalsBlurb ? `Vitals: ${vitalsBlurb}` : null,
    `Clinician note: ${clinicianNote}`,
  ]
    .filter(Boolean)
    .join('\n')

  // Embed the query.
  const embedResp = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  })
  const queryVec = embedResp.data[0]?.embedding
  if (!queryVec) return []

  // Cosine similarity via pgvector. Supabase RPC pattern works here too,
  // but a direct .rpc call to a SQL function is the clean path. We don't
  // have a function for this yet — write the SQL inline via .rpc('match_corpus').
  // For now, do a raw select via service-role; pgvector exposes the <=> operator.
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('match_medical_corpus', {
    query_embedding: queryVec,
    match_count: limit,
  })

  if (error) {
    console.warn('match_medical_corpus failed:', error.message)
    return []
  }

  return (data ?? []) as RetrievedChunk[]
}

/**
 * Format retrieved chunks into the user-message context block, with
 * stable IDs the AI prompt requires for citation.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant guideline excerpts retrieved.'
  return chunks
    .map(
      (c) =>
        `[chunk_id=${c.id}] ${c.document_title}${c.section ? ` — ${c.section}` : ''}${c.source_year ? ` (${c.source_year})` : ''}\n${c.content}`,
    )
    .join('\n\n---\n\n')
}
