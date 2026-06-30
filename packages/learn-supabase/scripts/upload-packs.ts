#!/usr/bin/env tsx
/**
 * Upload chapter .kpack files to KaribuLearn Supabase Storage.
 *
 * Prerequisites:
 *   1. Run migrations/003_learn_storage_buckets.sql in the Learn Supabase project.
 *   2. Export packs: pnpm export-packs (from packages/learn-supabase)
 *   3. Set LEARN_SUPABASE_URL + LEARN_SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   cd packages/learn-supabase
 *   pnpm install
 *   pnpm upload-packs
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PACKAGE_DIR = process.cwd()
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')
const PACKS_DIR = path.join(REPO_ROOT, 'content/learn/published/chapters')
const BUCKET = 'learn-packs'
const STORAGE_PREFIX = 'v1'

const url = process.env.LEARN_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey =
  process.env.LEARN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing LEARN_SUPABASE_URL and LEARN_SUPABASE_SERVICE_ROLE_KEY (see .env.example).',
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const catalogPath = path.join(PACKS_DIR, 'pack-catalog.json')
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as {
    packs: Array<{ id: string; storage_path: string }>
  }

  let uploaded = 0
  for (const pack of catalog.packs) {
    const localPath = path.join(PACKS_DIR, `${pack.id}.kpack`)
    const storagePath = pack.storage_path ?? `${STORAGE_PREFIX}/${pack.id}.kpack`
    const body = await fs.readFile(localPath)
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
      contentType: 'application/json',
      upsert: true,
    })
    if (error) {
      throw new Error(`Upload failed for ${pack.id}: ${error.message}`)
    }
    uploaded += 1
    const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${storagePath}`
    console.log(`✓ ${pack.id} → ${publicUrl}`)
  }

  console.log(`\nUploaded ${uploaded} packs to ${BUCKET}/${STORAGE_PREFIX}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
