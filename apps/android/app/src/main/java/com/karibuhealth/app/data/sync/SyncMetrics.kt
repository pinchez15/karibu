package com.karibuhealth.app.data.sync

import android.util.Log

/**
 * Lightweight sync observability — structured logs for field debugging and
 * future telemetry wiring (PostHog/Sentry).
 */
object SyncMetrics {
    private const val TAG = "KaribuSyncMetrics"

    fun recordQueueProcessed(count: Int, failed: Int) {
        Log.i(TAG, "queue_processed success=$count failed=$failed")
    }

    fun recordRpcError(operation: String, httpCode: Int?, message: String?) {
        Log.w(TAG, "rpc_error op=$operation code=$httpCode msg=${message?.take(200)}")
    }

    fun recordAuth401(retrySucceeded: Boolean) {
        Log.w(TAG, "auth_401 retry_succeeded=$retrySucceeded")
    }

    fun recordOutboxReconciled(count: Int) {
        Log.i(TAG, "outbox_reconciled count=$count")
    }

    fun recordOutboxDepth(pending: Int) {
        if (pending > 20) {
            Log.w(TAG, "outbox_depth_high pending=$pending")
        }
    }
}
