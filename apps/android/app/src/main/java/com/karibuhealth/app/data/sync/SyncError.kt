package com.karibuhealth.app.data.sync

import java.io.IOException

/**
 * Typed error raised by the sync layer when an RPC/PostgREST call returns a
 * non-2xx status. Carries the HTTP code + a body preview so the engine can
 * classify (permanent vs transient vs auth) instead of string-matching a
 * generic message. See WP2 D2.
 *
 * The [message] preserves the historical `"<op> HTTP <code> <body>"` shape so
 * `lastError` (surfaced in SyncDetailsSheet) still reads the same for testers.
 */
class SyncHttpException(
    val code: Int,
    val body: String,
    val op: String,
) : Exception("$op HTTP $code ${body.take(300)}".trim())

/** How the sync engine should react to a failed entry. */
enum class SyncErrorKind {
    /** 4xx that will never succeed on retry — dead-letter immediately. */
    PERMANENT,

    /** Timeouts, 5xx, throttling — back off and retry. */
    TRANSIENT,

    /** 401 — refresh the token once per run and retry the same entry. */
    AUTH,
}

/**
 * Pure classifier — no side effects, no I/O — so it is exhaustively unit
 * testable (WP2 test #5). Called from [SyncEngine]'s catch block.
 *
 * Rules (WP2 D2):
 *  - 401                                   -> AUTH
 *  - 400, 403, 404, 409, 422              -> PERMANENT
 *      (a 409 that was actually reconcilable is handled at the call site and
 *      never reaches here as an exception; anything that does is unreconciled.)
 *  - 408, 429, any 5xx                     -> TRANSIENT
 *  - IOException / SocketTimeoutException   -> TRANSIENT
 *  - anything else (e.g. a serialization
 *    error on a malformed local payload)   -> TRANSIENT (safe default; the
 *      entry keeps its retry budget rather than being silently dead-lettered).
 */
fun classifySyncError(e: Throwable): SyncErrorKind {
    if (e is SyncHttpException) {
        return when (e.code) {
            401 -> SyncErrorKind.AUTH
            400, 403, 404, 409, 422 -> SyncErrorKind.PERMANENT
            408, 429 -> SyncErrorKind.TRANSIENT
            in 500..599 -> SyncErrorKind.TRANSIENT
            else -> SyncErrorKind.TRANSIENT
        }
    }
    if (e is IOException) return SyncErrorKind.TRANSIENT
    return SyncErrorKind.TRANSIENT
}
