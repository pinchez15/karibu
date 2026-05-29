package com.karibuhealth.app.data.sync

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Post-pull reconciliation — clears outbox rows whose entities already match
 * server state. Invoked after [PullSyncManager.pullAll] and successful push
 * batches in [SyncEngine].
 */
@Singleton
class PullReconciliationService @Inject constructor(
    private val outboxReconciler: OutboxReconciler,
) {
    suspend fun reconcileAfterPull() {
        outboxReconciler.reconcilePendingWithLocalState()
    }
}
