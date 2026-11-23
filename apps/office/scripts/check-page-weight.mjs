#!/usr/bin/env node
// Page-weight budget for Karibu Office core routes (spec §9, Phase 1 acceptance).
//
// Partners use low-end Android phones on 3G, so what matters is the JavaScript
// and CSS a first visit has to download. This reads the production build's
// manifests and sums the gzip size of what each core route loads.
//
//   pnpm --filter @karibu/office build && pnpm --filter @karibu/office budget
//
// Budgets are per route, gzip, JS + CSS. They are set a little above the
// current build so a regression fails CI, not so a specific number is "good".
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const NEXT = join(process.cwd(), '.next')
// Signed-in routes carry the sign-in library; the login-free pages a clinic
// opens on its own data must stay lighter.
const APP_BUDGET_KB = Number(process.env.OFFICE_APP_BUDGET_KB ?? 215)
const PUBLIC_BUDGET_KB = Number(process.env.OFFICE_PUBLIC_BUDGET_KB ?? 160)
const CORE = [
  ['/(app)/o/[office]/page', APP_BUDGET_KB],
  ['/(app)/o/[office]/clinics/page', APP_BUDGET_KB],
  ['/(app)/o/[office]/clinics/[id]/page', APP_BUDGET_KB],
  ['/(app)/o/[office]/clinics/[id]/onboarding/page', APP_BUDGET_KB],
  ['/(app)/o/[office]/money/page', APP_BUDGET_KB],
  ['/(public)/r/[token]/page', PUBLIC_BUDGET_KB],
  ['/(public)/i/[token]/page', PUBLIC_BUDGET_KB],
]

if (!existsSync(join(NEXT, 'build-manifest.json'))) {
  console.error('No production build found. Run `next build` first.')
  process.exit(2)
}

const read = (p) => JSON.parse(readFileSync(join(NEXT, p), 'utf8'))
const size = (file) => {
  const full = join(NEXT, file)
  return existsSync(full) ? gzipSync(readFileSync(full)).length : 0
}

const build = read('build-manifest.json')
// Polyfills are served with `nomodule`, so any browser new enough to run the app skips them.
const shared = new Set(build.rootMainFiles ?? [])

let failed = false
for (const [route, budget] of CORE) {
  const manifestPath = join('server', 'app', `${route}_client-reference-manifest.js`)
  const files = new Set(shared)
  if (!existsSync(join(NEXT, manifestPath))) {
    console.error(`MISSING ${route}: no build output for this route. Was it moved or renamed?`)
    failed = true
    continue
  }
  {
    // The manifest is a JS assignment; pull out every chunk path it references.
    const text = readFileSync(join(NEXT, manifestPath), 'utf8')
    for (const m of text.matchAll(/static\/(?:chunks|css)\/[^"'\\]+\.(?:js|css)/g)) files.add(m[0])
  }
  const kb = [...files].reduce((sum, f) => sum + size(f), 0) / 1024
  const over = kb > budget
  failed ||= over
  console.log(`${over ? 'OVER ' : 'ok   '} ${route.padEnd(48)} ${kb.toFixed(0).padStart(4)} KB gzip  (budget ${budget})`)
}
process.exit(failed ? 1 : 0)
