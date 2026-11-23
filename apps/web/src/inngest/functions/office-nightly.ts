import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'

/**
 * Karibu Office nightly job (docs/karibu-office-spec.md §7.E).
 *
 * Runs in the EHR app because this is where the service role and Inngest
 * already live; the office app (apps/office) deliberately has neither. All the
 * work happens in one SQL function, office_run_nightly():
 *   - scores every live clinic green / amber / red and stores the snapshot
 *   - raises and clears alert to-dos (no activity, usage drop, training)
 *   - moves clinics through automatic milestones (trained, live, steady)
 *   - marks invoices overdue
 *   - verifies grant milestones
 *
 * 02:00 Kampala: after the clinic day, before partners look at their phones.
 */
export const officeNightly = inngest.createFunction(
  { id: 'office-nightly', name: 'Karibu Office: clinic health, alerts and milestones', retries: 2 },
  { cron: 'TZ=Africa/Kampala 0 2 * * *' },
  async ({ step, logger }) => {
    const result = await step.run('run', async () => {
      const { data, error } = await createServiceClient().rpc('office_run_nightly')
      if (error) throw new Error(`office_run_nightly failed: ${error.message}`)
      return data as { clinics_scored: number; invoices_marked_overdue: number; milestones_verified: number }
    })
    logger.info('office nightly', result)
    return result
  },
)
