import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { structureDictation } from '@/inngest/functions/structure-dictation'
import { pollAiStructureQueue } from '@/inngest/functions/poll-ai-queue'

// Single endpoint Inngest calls to invoke every registered function.
// `npx inngest-cli@latest dev` discovers functions from here during local dev;
// in production, register the deployed URL in the Inngest dashboard.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [structureDictation, pollAiStructureQueue],
})
