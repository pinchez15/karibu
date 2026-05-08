#!/usr/bin/env tsx
/**
 * Embed PDFs from `Medical Corpus/` into Supabase + Storage.
 *
 * For each PDF in the configured corpus directory:
 *   1. Upload the file to the medical-corpus storage bucket (public).
 *   2. Extract text via pdf-parse.
 *   3. Chunk the text by section heading where possible, otherwise by
 *      ~800-token sliding window with overlap.
 *   4. Embed each chunk with OpenAI text-embedding-3-small.
 *   5. Upsert medical_documents (one row per PDF) and medical_corpus
 *      (one row per chunk).
 *   6. Mark the document is_published = true so it's visible in /library
 *      and to the AI review function.
 *
 * Re-runnable. Re-running for the same PDF deletes the old chunks and
 * re-inserts (atomic per document) so updates don't leave stragglers.
 *
 * Usage:
 *   cd packages/supabase
 *   pnpm install
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *     pnpm embed-corpus
 *
 * Or with a .env file at packages/supabase/.env (auto-loaded).
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
// Import the inner module directly — the pdf-parse top-level wrapper
// runs a debug self-test that looks for a missing fixture PDF on import
// and crashes if it's not present. The inner module exports the same
// function and skips the self-test.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

// Run from packages/supabase/. Walk up to repo root and look for
// "Medical Corpus/", or accept CORPUS_DIR env override.
const PACKAGE_DIR = process.cwd()
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')
const CORPUS_DIR = process.env.CORPUS_DIR
  ? path.resolve(process.env.CORPUS_DIR)
  : path.join(REPO_ROOT, 'Medical Corpus')
const STORAGE_BUCKET = 'medical-corpus'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const TARGET_CHARS_PER_CHUNK = 3500 // ~800 tokens at ~4.5 chars/token average
const CHUNK_OVERLAP_CHARS = 400

// Per-PDF metadata. Title, topic, source_org, source_year, summary,
// reviewers — everything that powers the /library card. Slug is used in
// both the URL and the storage object name. If you add a new PDF, add
// its metadata here and re-run the script.
type Topic =
  | 'malaria'
  | 'hiv_tb'
  | 'maternal_anc'
  | 'child_health'
  | 'ncd'
  | 'mental_health'
  | 'emergency'
  | 'imci'
  | 'pharmacology'
  | 'guidelines_general'

interface CorpusFile {
  filename: string
  slug: string
  title: string
  topic: Topic
  source_org: string
  source_year: number
  summary: string
  reviewers: string[]
}

const CORPUS: CorpusFile[] = [
  {
    filename: 'UCG-2023-Publication-Final-PDF-Version-1.pdf',
    slug: 'uganda-clinical-guidelines-2023',
    title: 'Uganda Clinical Guidelines 2023',
    topic: 'guidelines_general',
    source_org: 'Ministry of Health, Uganda',
    source_year: 2023,
    summary:
      'The cross-cutting Ministry of Health treatment reference for HC II–IV in Uganda. Diagnosis, management, and referral pathways for the most common presentations.',
    reviewers: [],
  },
  {
    filename: 'Consolidated-HIV-and-AIDS-Guidelines-20230516.pdf',
    slug: 'uganda-hiv-aids-consolidated-guidelines-2023',
    title: 'Uganda Consolidated HIV and AIDS Guidelines (May 2023)',
    topic: 'hiv_tb',
    source_org: 'Ministry of Health, Uganda',
    source_year: 2023,
    summary:
      'National consolidated guidance on HIV testing, ART regimens, prevention, and TB co-infection management. Updated May 2023.',
    reviewers: [],
  },
  {
    filename: 'IMNCI_BOOKLET.pdf',
    slug: 'who-imnci-chart-booklet',
    title: 'WHO IMNCI Chart Booklet',
    topic: 'imci',
    source_org: 'World Health Organization',
    source_year: 2014,
    summary:
      'Integrated Management of Newborn and Childhood Illness algorithms. Assessment, classification, and treatment for under-fives at first-level facilities.',
    reviewers: [],
  },
  {
    filename: 'uganda-2023 EMHSLU.pdf',
    slug: 'uganda-essential-medicines-list-2023',
    title: 'Essential Medicines and Health Supplies List for Uganda (2023)',
    topic: 'pharmacology',
    source_org: 'Ministry of Health, Uganda',
    source_year: 2023,
    summary:
      'The 2023 Essential Medicines and Health Supplies List (EMHSLU). Drugs by therapeutic class with the level of care at which each is meant to be available.',
    reviewers: [],
  },
]

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in env.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------

function slugifySection(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

/**
 * Split extracted PDF text into chunks. Two-pass:
 *   1. Detect section breaks by lines that look like headings (numeric
 *      prefix like "4.2", or all-caps lines, or short lines followed by
 *      blank). Each section becomes its own chunk family.
 *   2. Inside each section, split into ~3500-char windows with overlap.
 *
 * The heuristic is intentionally tolerant — PDFs are messy. We don't
 * need perfect section detection; we need stable section_anchor URLs
 * so AI citations are deep-linkable, and reasonable retrieval quality.
 */
interface RawChunk {
  section: string | null
  section_anchor: string | null
  content: string
}

function chunkPdfText(rawText: string): RawChunk[] {
  // Normalize whitespace, strip page-break form feeds.
  const normalized = rawText
    .replace(/\f/g, '\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Detect section headings: lines that start with a numeric prefix
  // (e.g., "4.2 Treatment") OR are short ALL-CAPS lines surrounded by
  // blanks.
  const lines = normalized.split('\n')
  const sections: { heading: string | null; body: string[] }[] = [
    { heading: null, body: [] },
  ]

  const headingRegex = /^([0-9]+(\.[0-9]+){0,3})\s+(.{2,80})$/
  const allCapsRegex = /^[A-Z][A-Z0-9 ,\-/&'()]{4,80}$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) {
      sections[sections.length - 1].body.push('')
      continue
    }

    const numericMatch = line.match(headingRegex)
    const isAllCapsHeading =
      allCapsRegex.test(line) &&
      line.split(' ').length <= 12 &&
      // Surrounded by blank-ish neighbours (at least one side).
      (i === 0 ||
        lines[i - 1].trim().length === 0 ||
        i + 1 >= lines.length ||
        lines[i + 1].trim().length === 0)

    if (numericMatch) {
      sections.push({ heading: line, body: [] })
    } else if (isAllCapsHeading) {
      sections.push({ heading: line, body: [] })
    } else {
      sections[sections.length - 1].body.push(line)
    }
  }

  // Build chunks. Inside each section, slide a ~3500-char window with
  // overlap so adjacent paragraphs are co-retrievable.
  const chunks: RawChunk[] = []
  const seenAnchors = new Set<string>()

  for (const sec of sections) {
    const body = sec.body.join('\n').trim()
    if (body.length === 0) continue

    const heading = sec.heading
    const baseAnchor = heading ? slugifySection(heading) : null
    let anchor = baseAnchor
    if (anchor && seenAnchors.has(anchor)) {
      let i = 2
      while (seenAnchors.has(`${baseAnchor}-${i}`)) i += 1
      anchor = `${baseAnchor}-${i}`
    }
    if (anchor) seenAnchors.add(anchor)

    if (body.length <= TARGET_CHARS_PER_CHUNK) {
      chunks.push({
        section: heading,
        section_anchor: anchor,
        content: body,
      })
      continue
    }

    let start = 0
    let part = 0
    while (start < body.length) {
      const end = Math.min(start + TARGET_CHARS_PER_CHUNK, body.length)
      // Try to break at a paragraph boundary if possible.
      let breakAt = end
      if (end < body.length) {
        const para = body.lastIndexOf('\n\n', end)
        if (para > start + TARGET_CHARS_PER_CHUNK / 2) breakAt = para
      }
      const slice = body.slice(start, breakAt).trim()
      if (slice.length > 0) {
        const partAnchor =
          anchor && part > 0 ? `${anchor}-p${part + 1}` : anchor
        chunks.push({
          section: heading,
          section_anchor: partAnchor,
          content: slice,
        })
      }
      if (breakAt >= body.length) break
      start = Math.max(breakAt - CHUNK_OVERLAP_CHARS, start + 1)
      part += 1
    }
  }

  return chunks
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  // OpenAI accepts up to 2048 inputs per embeddings call. We're
  // comfortably under that for any single PDF.
  const resp = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return resp.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[])
}

// ----------------------------------------------------------------------------
// Per-PDF pipeline
// ----------------------------------------------------------------------------

async function ingestPdf(file: CorpusFile): Promise<void> {
  const filePath = path.join(CORPUS_DIR, file.filename)
  console.log(`\n--- ${file.title} ---`)

  const buffer = await fs.readFile(filePath)
  console.log(`  Read ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

  // 1. Upload to Storage. Key path uses the slug so the URL is stable.
  const storageKey = `${file.slug}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)
  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storageKey)
  const sourceUrl = urlData.publicUrl
  console.log(`  Uploaded → ${sourceUrl}`)

  // 2. Extract text.
  const parsed = await pdfParse(buffer)
  const rawText = parsed.text
  if (!rawText || rawText.trim().length < 200) {
    throw new Error(`PDF extraction returned almost no text (${rawText.length} chars)`)
  }
  console.log(`  Extracted ${rawText.length.toLocaleString()} chars from ${parsed.numpages} pages`)

  // 3. Chunk.
  const rawChunks = chunkPdfText(rawText)
  console.log(`  Chunked into ${rawChunks.length} pieces`)
  if (rawChunks.length === 0) {
    throw new Error('Chunker produced zero chunks')
  }

  // 4. Upsert document.
  const { data: docRow, error: docErr } = await supabase
    .from('medical_documents')
    .upsert(
      {
        slug: file.slug,
        title: file.title,
        topic: file.topic,
        jurisdiction: 'uganda',
        source_org: file.source_org,
        source_year: file.source_year,
        source_url: sourceUrl,
        summary: file.summary,
        reviewers: file.reviewers,
        last_reviewed_at: new Date().toISOString().slice(0, 10),
        is_published: true,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (docErr || !docRow) throw new Error(`medical_documents upsert: ${docErr?.message ?? 'no row'}`)

  const documentId = docRow.id as number

  // 5. Drop existing chunks for this document so the new set replaces
  //    them atomically.
  const { error: deleteErr } = await supabase
    .from('medical_corpus')
    .delete()
    .eq('document_id', documentId)
  if (deleteErr) throw new Error(`old chunk delete: ${deleteErr.message}`)

  // 6. Embed in batches and insert.
  const BATCH = 64
  let inserted = 0
  for (let i = 0; i < rawChunks.length; i += BATCH) {
    const slice = rawChunks.slice(i, i + BATCH)
    const embeddings = await embedBatch(slice.map((c) => c.content))
    const rows = slice.map((c, j) => ({
      document_id: documentId,
      section: c.section,
      section_anchor: c.section_anchor,
      chunk_index: i + j,
      content: c.content,
      embedding: embeddings[j] as unknown as string, // pgvector accepts the JSON array form
    }))

    const { error: insertErr } = await supabase.from('medical_corpus').insert(rows)
    if (insertErr) throw new Error(`chunk insert: ${insertErr.message}`)

    inserted += rows.length
    process.stdout.write(`  Embedded ${inserted}/${rawChunks.length}\r`)
  }
  console.log(`  Embedded ${inserted}/${rawChunks.length} chunks`)
  console.log(`  ✓ ${file.title} ready in /library/${file.slug}`)
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  // Sanity checks.
  try {
    await fs.access(CORPUS_DIR)
  } catch {
    console.error(`Corpus directory not found: ${CORPUS_DIR}`)
    process.exit(1)
  }

  const dirEntries = await fs.readdir(CORPUS_DIR)
  for (const file of CORPUS) {
    if (!dirEntries.includes(file.filename)) {
      console.error(`PDF not found in corpus dir: ${file.filename}`)
      process.exit(1)
    }
  }

  console.log(`Embedding corpus from ${CORPUS_DIR}`)
  console.log(`  → bucket: ${STORAGE_BUCKET}`)
  console.log(`  → model:  ${EMBEDDING_MODEL}`)
  console.log(`  → docs:   ${CORPUS.length}`)

  for (const file of CORPUS) {
    try {
      await ingestPdf(file)
    } catch (e) {
      console.error(`  ✗ ${file.title}: ${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
