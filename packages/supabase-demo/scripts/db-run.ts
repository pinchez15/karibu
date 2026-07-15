/**
 * Demo-database runner. Applies the baseline schema, seeds, resets to
 * baseline, or marks the production migration chain as applied.
 *
 *   tsx scripts/db-run.ts baseline       apply migrations/0001_baseline.sql, then
 *                                        record packages/supabase/migrations versions
 *                                        in the demo migration history — so future
 *                                        `supabase db push` applies only NEW migrations
 *   tsx scripts/db-run.ts seed           apply seed/*.sql in filename order
 *   tsx scripts/db-run.ts reset          truncate clinical data + clear audio + reseed
 *
 * HARD GUARDS — this script can never point at production:
 *   - DEMO_DB_URL must NOT contain the production project ref
 *   - DEMO_DB_URL must contain the ref pinned in ./demo-project-ref
 *
 * Set DEMO_DB_URL in packages/supabase-demo/.env (gitignored) or the environment.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenv } from 'dotenv'
import pg from 'pg'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROD_REF = 'sopirdewhhpxdxpwwosn'
const PROD_MIGRATIONS_DIR = join(ROOT, '..', 'supabase', 'migrations')
const BASELINE = join(ROOT, 'migrations', '0001_baseline.sql')

// Everything clinical/operational. Kept on reset: clinics, staff, catalogs,
// clinic_* settings, HMIS codes, protocol definitions, corpus, onboarding.
const RESET_TABLES = [
  'visits', 'patients', 'patient_vitals', 'patient_notes', 'patient_consents',
  'provider_notes', 'provider_note_addendums', 'provider_note_amendments',
  'audio_uploads',
  'prescription_orders', 'dispense_records',
  'pharmacy_stock_items', 'pharmacy_stock_movements', 'pharmacy_stock_batches',
  'lab_stock_items', 'lab_stock_movements',
  'payments', 'charges',
  'care_tasks',
  'admissions', 'admission_observations', 'admission_notes',
  'medication_orders', 'medication_administrations',
  'iv_infusions', 'iv_infusion_checks',
  'deliveries', 'postnatal_observations',
  'pregnancies', 'anc_contacts',
  'hts_events', 'hiv_care_enrollments', 'viral_load_tests',
  'tb_episodes', 'tb_preventive_treatment',
  'referrals', 'appointments', 'ebola_screenings',
  'visit_critical_alerts', 'visit_diagnosis_codes',
  'ai_review_suggestions', 'consult_threads', 'consult_messages',
  'protocol_activations',
  'sync_operations', 'audit_logs', 'chart_access_log',
  'patient_number_sequences', 'payment_receipt_sequences',
]

function demoUrl(): string {
  dotenv({ path: join(ROOT, '.env') })
  const url = process.env.DEMO_DB_URL
  if (!url) {
    throw new Error('DEMO_DB_URL is not set. Put it in packages/supabase-demo/.env (Supabase dashboard -> demo project -> Connect -> Session pooler).')
  }
  if (url.includes(PROD_REF)) {
    throw new Error(`REFUSING: DEMO_DB_URL contains the PRODUCTION project ref (${PROD_REF}).`)
  }
  const ref = readFileSync(join(ROOT, 'demo-project-ref'), 'utf8').trim()
  if (!ref || ref.includes('REPLACE')) {
    throw new Error('Pin the demo project ref in packages/supabase-demo/demo-project-ref first.')
  }
  if (!url.includes(ref)) {
    throw new Error(`REFUSING: DEMO_DB_URL does not contain the pinned demo ref (${ref}).`)
  }
  return url
}

async function applySqlFile(client: pg.Client, path: string): Promise<void> {
  const sql = readFileSync(path, 'utf8')
  process.stdout.write(`  applying ${path.split('/').slice(-2).join('/')} ... `)
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('COMMIT')
    console.log('ok')
  } catch (err) {
    await client.query('ROLLBACK')
    console.log('FAILED')
    throw err
  }
}

async function seed(client: pg.Client): Promise<void> {
  const files = readdirSync(join(ROOT, 'seed'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(ROOT, 'seed', f))
  for (const f of files) await applySqlFile(client, f)
}

async function baseline(client: pg.Client): Promise<void> {
  if (!existsSync(BASELINE)) {
    throw new Error('migrations/0001_baseline.sql not found — run scripts/build-baseline.sh first.')
  }
  await applySqlFile(client, BASELINE)

  // Record the production migration chain as applied so a future
  // `supabase db push` (from packages/supabase, targeting the demo db-url)
  // applies only migrations newer than the baseline.
  const versions = readdirSync(PROD_MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ version: f.split('_')[0], name: f.replace(/\.sql$/, '') }))
    .sort((a, b) => a.version.localeCompare(b.version))
  console.log(`  marking ${versions.length} migration versions as applied ...`)
  await client.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations`)
  await client.query(
    `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
       version TEXT PRIMARY KEY, statements TEXT[], name TEXT
     )`,
  )
  for (const { version, name } of versions) {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [version, name],
    )
  }
}

async function reset(client: pg.Client): Promise<void> {
  const { rows } = await client.query(
    `SELECT t FROM unnest($1::text[]) AS t WHERE to_regclass('public.' || t) IS NOT NULL`,
    [RESET_TABLES],
  )
  const existing: string[] = rows.map((r: { t: string }) => r.t)
  const missing = RESET_TABLES.filter((t) => !existing.includes(t))
  if (missing.length > 0) console.log(`  (skipping absent tables: ${missing.join(', ')})`)
  console.log(`  truncating ${existing.length} clinical tables ...`)
  await client.query(`TRUNCATE TABLE ${existing.map((t) => `public."${t}"`).join(', ')} CASCADE`)
  // No storage cleanup needed: audio is never stored (migration 023 removed
  // the bucket; dictation streams to Whisper), and new Supabase projects
  // block direct DML on storage tables anyway.
  // Reference data (10_) and clinic backfill (30_) are idempotent; the census
  // (20_) recreates all demo patients/visits/stock with fixed UUIDs and
  // NOW()-relative dates, so "today's clinic" is always fresh.
  await seed(client)
  // Staff rows survive resets (guests stay logged in), but new staff are
  // gated by required onboarding (migration 079) before they can register
  // patients. In the demo, unlock everyone; record the onboarding flow from
  // a deliberately fresh account instead.
  console.log('  unlocking onboarding for all demo staff ...')
  await client.query(
    `UPDATE staff SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())`,
  )
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  if (!['baseline', 'seed', 'reset'].includes(cmd ?? '')) {
    console.error('usage: tsx scripts/db-run.ts <baseline|seed|reset>')
    process.exit(1)
  }
  const client = new pg.Client({ connectionString: demoUrl() })
  await client.connect()
  try {
    console.log(`== demo ${cmd}`)
    if (cmd === 'baseline') await baseline(client)
    if (cmd === 'seed') await seed(client)
    if (cmd === 'reset') await reset(client)
    console.log('== complete')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
