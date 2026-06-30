#!/usr/bin/env tsx
/**
 * Merge pack-catalog.json into the Learn Android manifest with Supabase Storage URLs.
 *
 * Usage:
 *   cd packages/learn-supabase
 *   pnpm sync-manifest
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'

const PACKAGE_DIR = process.cwd()
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')
const CATALOG_PATH = path.join(REPO_ROOT, 'content/learn/published/chapters/pack-catalog.json')
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'apps/learn-android/src/main/assets/learn/manifest.json',
)

const supabaseUrl =
  process.env.LEARN_STORAGE_PUBLIC_BASE?.replace(/\/learn-packs\/?$/, '') ??
  process.env.LEARN_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'https://zvandlyuhhovvqovutyq.supabase.co'

const storageBase = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/learn-packs`

type CatalogPack = {
  id: string
  title: string
  subtitle: string
  topic: string
  level: number
  chapter_id: string
  case_count: number
  approx_size_kb: number
  storage_path: string
  version: number
}

type ManifestPack = {
  id: string
  title: string
  subtitle: string
  topic: string
  case_count: number
  approx_size_kb: number
  bundled: boolean
  asset_path?: string
  download_url?: string
  level?: number
  chapter_id?: string
  version: number
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8')) as {
    packs: CatalogPack[]
  }
  const existing = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as {
    packs: ManifestPack[]
  }

  const bundled = existing.packs.filter((pack) => pack.bundled)
  const downloadable: ManifestPack[] = catalog.packs
    .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
    .map((pack) => ({
      id: pack.id,
      title: pack.title,
      subtitle: pack.subtitle,
      topic: pack.topic,
      case_count: pack.case_count,
      approx_size_kb: pack.approx_size_kb,
      bundled: false,
      level: pack.level,
      chapter_id: pack.chapter_id,
      download_url: `${storageBase}/${pack.storage_path}`,
      version: pack.version,
    }))

  const manifest = { packs: [...bundled, ...downloadable] }
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    `Wrote ${manifest.packs.length} packs to ${path.relative(REPO_ROOT, MANIFEST_PATH)} ` +
      `(${bundled.length} bundled, ${downloadable.length} downloadable)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
