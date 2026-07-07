import 'server-only'

import * as Sentry from '@sentry/nextjs'

/**
 * WP6 Step 0 — canonical span names for heavy dashboard loaders.
 *
 * How to read timings:
 * - **Local dev:** run `pnpm web`, load a dashboard page, watch the terminal for
 *   `[perf] loader.* <ms>` lines (one per instrumented loader).
 * - **Sentry (when `NEXT_PUBLIC_SENTRY_DSN` is set):** open Performance →
 *   Transactions for the route (e.g. `/dashboard/worklists`); child spans use
 *   `op: web.loader` and the names below. Sample rate is 10% (see
 *   `sentry.server.config.ts`).
 */
export const PERF_LOADER = {
  worklistsGetAll: 'loader.worklists.getAllWorklists',
  visitDetails: 'loader.visits.getVisitDetails',
  visitPage: 'loader.visits.page',
  billingPatientBalances: 'loader.billing.listPatientBalances',
  opdQueue: 'loader.opd.getQueueData',
  opdPage: 'loader.opd.page',
  pharmacyQueue: 'loader.pharmacy.getPharmacyStationQueue',
  patientGet: 'loader.patients.getPatient',
  patientTimeline: 'loader.patients.getPatientTimeline',
  patientLatestVitals: 'loader.patients.getPatientLatestVitals',
  patientPage: 'loader.patients.page',
} as const

export type PerfLoaderName = (typeof PERF_LOADER)[keyof typeof PERF_LOADER]

function logDevTiming(name: string, durationMs: number) {
  if (process.env.NODE_ENV === 'development') {
    console.info(`[perf] ${name} ${durationMs.toFixed(1)}ms`)
  }
}

/** Measure a server-side data loader for WP6 performance baselines. */
export async function measureServerLoader<T>(
  name: PerfLoaderName | string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now()

  const finish = (span?: { setAttribute: (key: string, value: number) => void }) => {
    const durationMs = performance.now() - start
    span?.setAttribute('duration_ms', durationMs)
    logDevTiming(name, durationMs)
  }

  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return Sentry.startSpan({ name, op: 'web.loader' }, async (span) => {
      try {
        return await fn()
      } finally {
        finish(span)
      }
    })
  }

  try {
    return await fn()
  } finally {
    finish()
  }
}
