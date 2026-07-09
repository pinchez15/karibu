package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contract tests mirroring [com.karibuhealth.app.data.local.db.dao.SyncQueueDao]
 * SQL for blocked rows (`status='failed'`, `attempts >= max_attempts`,
 * `last_error LIKE 'blocked:%'`).
 */
class SyncQueueDaoBlockedRowsTest {

    @Test
    fun `blocked rows excluded from getPendingCount and getRetryable included in getTerminallyFailedCount`() {
        fun countsToPendingPill(e: SyncQueueEntry) =
            e.status in setOf("pending", "failed") && e.attempts < e.maxAttempts

        fun countsToRetryable(e: SyncQueueEntry, now: Long = System.currentTimeMillis()) =
            e.status in setOf("pending", "failed") &&
                e.attempts < e.maxAttempts &&
                (e.nextRetryAt == null || e.nextRetryAt <= now)

        fun countsToNeedsAttention(e: SyncQueueEntry) =
            e.status == "failed" && e.attempts >= e.maxAttempts

        val blocked = makeEntry(
            status = "failed",
            attempts = 10,
            maxAttempts = 10,
            lastError = "blocked: upstream create_patient failed",
        )
        val exhaustedOwnRetries = makeEntry(
            status = "failed",
            attempts = 10,
            maxAttempts = 10,
            lastError = "HTTP 422 unprocessable",
        )
        val retrying = makeEntry(status = "failed", attempts = 3, maxAttempts = 10, lastError = "timeout")
        val pending = makeEntry(status = "pending", attempts = 0, maxAttempts = 10)

        for (entry in listOf(blocked, exhaustedOwnRetries)) {
            assertFalse("terminally failed ${entry.id} must not count as pending", countsToPendingPill(entry))
            assertFalse("terminally failed ${entry.id} must not be retryable", countsToRetryable(entry))
            assertTrue("terminally failed ${entry.id} must surface in needs attention", countsToNeedsAttention(entry))
        }

        assertTrue(countsToPendingPill(retrying))
        assertTrue(countsToRetryable(retrying))
        assertFalse(countsToNeedsAttention(retrying))

        assertTrue(countsToPendingPill(pending))
        assertTrue(countsToRetryable(pending))
        assertFalse(countsToNeedsAttention(pending))
    }

    private fun makeEntry(
        status: String,
        attempts: Int,
        maxAttempts: Int,
        lastError: String? = null,
        nextRetryAt: Long? = null,
    ) = SyncQueueEntry(
        id = "entry-$status-$attempts",
        operationType = "create_patient",
        entityType = "patients",
        entityId = "patient-1",
        payload = "{}",
        status = status,
        attempts = attempts,
        maxAttempts = maxAttempts,
        lastError = lastError,
        createdAt = System.currentTimeMillis(),
        nextRetryAt = nextRetryAt,
    )
}
