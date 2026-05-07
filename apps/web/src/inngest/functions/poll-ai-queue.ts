import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'

/**
 * Inngest scheduled poller — fires `note.dictated` for every visit where
 * the clinician has finished documenting (any input mode: typed, Whisper,
 * Google keyboard mic) but AI structuring hasn't been kicked off yet.
 *
 * Why polling instead of a Postgres trigger or Supabase webhook:
 *   - The visits_notify_trigger 3-day debug taught us not to put HTTP in
 *     Postgres. The realtime.send signature changed silently and broke
 *     every visit insert.
 *   - Webhooks are realtime-extension adjacent; same risk family.
 *   - Polling is self-healing: if Inngest is down, work queues up; once
 *     back, it processes. No data loss path.
 *   - 30s latency is fine — most patients are still at the clinic when AI
 *     completes (the AI run is ~10-15s).
 *
 * Each visit transitions:
 *   not_started → pending (this poller)
 *               → running (set by structureDictation on entry)
 *               → completed | failed (set by structureDictation on exit)
 *
 * The poller is idempotent and retry-safe — Inngest concurrency=1 on
 * event.data.visit_id collapses duplicate dispatches.
 */
export const pollAiStructureQueue = inngest.createFunction(
  {
    id: 'poll-ai-structure-queue',
    name: 'Poll for visits needing AI structuring',
    // No concurrency cap — the function itself is fast (a single SELECT
    // + N event sends). Per-visit collapsing happens at structureDictation.
  },
  { cron: '*/1 * * * *' }, // every 1 minute (Inngest free tier minimum)
  async ({ step, logger }) => {
    const dispatched = await step.run('dispatch', async () => {
      const supabase = createServiceClient()

      // Pick up at most 50 per run. Caps the burst when a clinic syncs a
      // backlog after coming online; the next minute's run picks up the rest.
      const { data: rows, error } = await supabase
        .from('visits')
        .select('id, clinic_id, ai_structure_attempts')
        .eq('documentation_complete', true)
        .in('ai_structure_status', ['not_started'])
        .lt('ai_structure_attempts', 5)
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
      // structureDictation will flip to 'running' on entry.
      const ids = rows.map((r) => r.id)
      const { error: updateErr } = await supabase
        .from('visits')
        .update({ ai_structure_status: 'pending' })
        .in('id', ids)
      if (updateErr) {
        logger.error('Poll status flip failed', { error: updateErr.message })
        return { dispatched: 0, error: updateErr.message }
      }

      // Fan out events. Inngest batches these under the hood.
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
