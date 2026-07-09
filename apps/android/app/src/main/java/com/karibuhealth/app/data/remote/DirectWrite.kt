package com.karibuhealth.app.data.remote

import com.karibuhealth.app.data.sync.TokenRefresher
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps a direct (non-outbox) RPC attempt: on 401, refresh the Clerk token
 * once and retry the same call once. Any other failure returns as-is —
 * callers keep their existing fall-through-to-outbox behavior.
 */
@Singleton
class DirectWriteExecutor @Inject constructor(
    private val tokenRefresher: TokenRefresher,
) {
    suspend fun <T> run(block: suspend () -> Response<T>): Response<T> {
        val first = block()
        if (first.code() != 401) return first
        if (!tokenRefresher.refreshToken()) return first
        return block()
    }
}
