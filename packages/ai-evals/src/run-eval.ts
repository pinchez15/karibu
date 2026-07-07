#!/usr/bin/env node
import OpenAI from 'openai'
import { assertCaseExpectations, evaluateCase } from './evaluate-case.js'
import { GOLDEN_CASES, getGoldenCase } from './golden-cases.js'

function parseArgs(argv: string[]): { caseId?: string; help: boolean } {
  let caseId: string | undefined
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--case') {
      caseId = argv[i + 1]
      i++
    } else if (arg.startsWith('--case=')) {
      caseId = arg.slice('--case='.length)
    }
  }

  return { caseId, help }
}

function printHelp(): void {
  console.log(`Karibu AI review eval harness

Usage:
  pnpm --filter @karibu/ai-evals eval [--case <id>]

Options:
  --case <id>   Run a single golden case by id
  -h, --help    Show this help

Requires OPENAI_API_KEY. Uses gpt-4o-mini with mocked corpus chunks (no Supabase).
`)
}

async function main(): Promise<number> {
  const { caseId, help } = parseArgs(process.argv.slice(2))
  if (help) {
    printHelp()
    return 0
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.log('OPENAI_API_KEY not set — skipping AI eval run.')
    console.log('Set OPENAI_API_KEY to execute golden cases against the live model.')
    return 0
  }

  const cases = caseId
    ? (() => {
        const found = getGoldenCase(caseId)
        if (!found) {
          console.error(`Unknown case id: ${caseId}`)
          console.error(`Available: ${GOLDEN_CASES.map((c) => c.id).join(', ')}`)
          process.exit(1)
        }
        return [found]
      })()
    : GOLDEN_CASES

  const openai = new OpenAI({ apiKey })
  let failed = 0
  let passed = 0

  console.log(`Running ${cases.length} golden case(s) with model ${process.env.OPENAI_STRUCTURING_MODEL || 'gpt-4o-mini'}...\n`)

  for (const goldenCase of cases) {
    process.stdout.write(`• ${goldenCase.id} — ${goldenCase.name} ... `)
    try {
      const { suggestions } = await evaluateCase(openai, { goldenCase })
      const result = assertCaseExpectations(goldenCase, suggestions)
      if (result.pass) {
        passed++
        console.log(`PASS (${result.message})`)
      } else {
        failed++
        console.log(`FAIL (${result.message})`)
        if (suggestions.length > 0) {
          for (const s of suggestions) {
            console.log(`    - [${s.type}] ${s.question}`)
          }
        }
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`ERROR (${msg})`)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (${cases.length} total)`)
  return failed > 0 ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
