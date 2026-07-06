package com.karibuhealth.app.data.sync

/**
 * Narrow seam the sync engine uses to refresh the auth token, decoupled from
 * the concrete Clerk implementation so [SyncEngine] stays unit-testable
 * (WP2 D3). Implemented by `ClerkAuthManager`; bound in the DI graph.
 */
interface TokenRefresher {
    /**
     * Fetch a fresh auth token (skipping cache). Returns true only when a
     * non-blank token was obtained and persisted; false on any failure. Never
     * throws for an ordinary refresh failure — the reason is logged instead.
     */
    suspend fun refreshToken(): Boolean
}
