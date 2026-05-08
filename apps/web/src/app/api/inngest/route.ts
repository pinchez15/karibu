import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { reviewClinicianNote } from '@/inngest/functions/review-clinician-note'
import { draftPatientReceipt } from '@/inngest/functions/draft-patient-receipt'
import { suggestHmisCode } from '@/inngest/functions/suggest-hmis-code'
import { pollAiStructureQueue } from '@/inngest/functions/poll-ai-queue'

// Single endpoint Inngest calls to invoke every registered function.
//
// Each saved visit fires `note.dictated`, which fans out to three small
// functions in parallel: review (asks a question if AI would disagree),
// receipt (plain-language patient slip), HMIS code suggestion (clinician
// confirms via DiagnosisCoder). The poller catches up any visits that
// land via offline-first sync without a direct event dispatch.
//
// `npx inngest-cli@latest dev` discovers functions from here during local
// dev; in production, register the deployed URL in the Inngest dashboard.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    reviewClinicianNote,
    draftPatientReceipt,
    suggestHmisCode,
    pollAiStructureQueue,
  ],
})
