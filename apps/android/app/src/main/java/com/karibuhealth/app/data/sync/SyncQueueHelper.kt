package com.karibuhealth.app.data.sync

import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Upserts a single pending outbox row per (entity_id, operation_type) and
 * schedules an immediate push sync when online.
 */
@Singleton
class SyncQueueHelper @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
    private val workManager: WorkManager,
) {
    suspend fun enqueue(entry: SyncQueueEntry): String {
        val existing = syncQueueDao.getByEntityAndOperation(entry.entityId, entry.operationType)
        val id = if (existing != null && existing.status != "completed") {
            syncQueueDao.update(
                existing.copy(
                    payload = entry.payload,
                    status = "pending",
                    attempts = 0,
                    lastError = null,
                    nextRetryAt = null,
                    dependsOn = entry.dependsOn ?: existing.dependsOn,
                ),
            )
            existing.id
        } else {
            syncQueueDao.insert(entry)
            entry.id
        }
        scheduleImmediateSync()
        return id
    }

    fun scheduleImmediateSync() {
        workManager.enqueueUniqueWork(
            SyncWorker.WORK_NAME_IMMEDIATE,
            // APPEND_OR_REPLACE, not REPLACE: REPLACE cancels a sync batch
            // that's already mid-flight, stranding entries at 'in_progress'
            // and aborting RPCs that were about to land.
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            SyncWorker.buildImmediateRequest(),
        )
    }
}
