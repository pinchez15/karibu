import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { measureServerLoader, PERF_LOADER } from './server-timing'

describe('measureServerLoader', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns the loader result', async () => {
    const result = await measureServerLoader(PERF_LOADER.opdQueue, async () => ({ ok: true }))
    expect(result).toEqual({ ok: true })
  })

  it('logs timing in development', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await measureServerLoader('loader.test', async () => 42)
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[perf\] loader\.test \d+\.\dms$/))
  })
})
