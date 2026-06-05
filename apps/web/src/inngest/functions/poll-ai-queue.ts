import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'

/**
 * Inngest scheduled poller — fires `note.dictated` for every visit where
 * the clinician has finished documenting (any input mode: typed, Whisper,
 * Google keyboard mic) but the AI review hasn't been kicked off yet.
 *
 * Handlers on `note.dictated` (post-sign documentation):
 *   - draftPatientReceipt (plain-language summary for the thermal printer)
 *   - suggestHmisCode (ICD-10 → HMIS 105 bucket suggestion)
 *
 * AI notes (draft/lab) use `note.draft-ai-assist` / `note.lab-ai-assist` only —
 * see docs/ai-clinical-assist.md.
 *
 * Why polling instead of a Postgres trigger or Supabase webhook:
 *   - The visits_notify_trigger 3-day debug taught us not to put HTTP in
 *     Postgres.
 *   - Webhooks are realtime-extension adjacent; same risk family.
 *   - Polling is self-healing: if Inngest is down, work queues up; once
 *     back, it processes. No data loss.
 *   - 60s latency is fine — most patients are still at the clinic when AI
 *     completes.
 */
export const pollAiStructureQueue = inngest.createFunction(
  {
    id: 'poll-ai-structure-queue',
    name: 'Poll for visits needing AI review',
  },
  { cron: '*/1 * * * *' },
  async ({ step, logger }) => {
    const dispatched = await step.run('dispatch', async () => {
      const supabase = createServiceClient()

      const { data: rows, error } = await supabase
        .from('visits')
        .select('id, clinic_id, ai_review_attempts')
        .eq('documentation_complete', true)
        .in('ai_review_status', ['not_started'])
        .lt('ai_review_attempts', 5)
        .order('documentation_completed_at', { ascending: true, nullsFirst: false })
        .limit(50)

      if (error) {
        logger.error('Poll query failed', { error: error.message })
        return { dispatched: 0, error: error.message }
      }

      if (!rows || rows.length === 0) {
        return { dispatched: 0 }
      }

      // Mark as 'pending' BEFORE dispatch so a fast retry doesn't double-fire.
      // The reviewClinicianNote handler flips to 'running' on entry.
      const ids = rows.map((r) => r.id)
      const { error: updateErr } = await supabase
        .from('visits')
        .update({ ai_review_status: 'pending' })
        .in('id', ids)
      if (updateErr) {
        logger.error('Poll status flip failed', { error: updateErr.message })
        return { dispatched: 0, error: updateErr.message }
      }

      const events = rows.map((r) => ({
        name: 'note.dictated' as const,
        data: { visit_id: r.id, clinic_id: r.clinic_id },
      }))
      await inngest.send(events)

      return { dispatched: rows.length, ids }
    })

    return dispatched
  },
)
