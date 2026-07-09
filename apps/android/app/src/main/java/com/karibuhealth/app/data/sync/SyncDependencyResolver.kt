package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Resolves the queue entry a visit-scoped op must wait for: the pending
 * create_visit OR check-in queue_op that creates this visit server-side.
 * Null when the visit already exists on the server (nothing to wait for).
 * Minimal-depends_on rule (ehr-pivot-implementation.md §3.3): FK ordering only.
 */
@Singleton
class SyncDependencyResolver @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
) {
    suspend fun pendingVisitDependency(visitId: String): String? {
        syncQueueDao.getByEntityAndOperation(visitId, "create_visit")
            ?.takeIf { it.status != "completed" }?.let { return it.id }
        return syncQueueDao.getByEntityAndOperation(visitId, "queue_op")
            ?.takeIf { it.status != "completed" && it.payload.contains("\"check_in_patient\"") }
            ?.id
    }
}
