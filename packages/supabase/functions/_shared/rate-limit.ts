// Simple in-memory rate limiter for edge functions
// Uses a sliding window counter per key (IP or visit_id)
// Note: Each edge function instance has its own memory, so this is per-isolate.
// For strict rate limiting across instances, use a database-backed approach.

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60_000 // 1 minute
let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  for (const [key, entry] of store) {
    if (now - entry.windowStart > windowMs * 2) {
      store.delete(key)
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number  // Max requests per window
  windowMs: number     // Window size in milliseconds
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now()
  cleanup(config.windowMs)

  const entry = store.get(key)

  if (!entry || now - entry.windowStart > config.windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: config.maxRequests - 1 }
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart)
    return { allowed: false, remaining: 0, retryAfterMs }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count }
}

export function getRateLimitKey(req: Request, body?: { visit_id?: string }): string {
  // Use visit_id if available (prevents spamming same visit)
  if (body?.visit_id) return `visit:${body.visit_id}`

  // Fall back to IP
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
  return `ip:${ip}`
}
