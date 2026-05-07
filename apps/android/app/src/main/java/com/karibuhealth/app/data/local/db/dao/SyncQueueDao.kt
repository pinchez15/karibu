package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC")
    suspend fun getPending(): List<SyncQueueEntry>

    @Query("""
        SELECT * FROM sync_queue
        WHERE status IN ('pending', 'failed')
        AND attempts < max_attempts
        AND (next_retry_at IS NULL OR next_retry_at <= :now)
        ORDER BY created_at ASC
    """)
    suspend fun getRetryable(now: Long = System.currentTimeMillis()): List<SyncQueueEntry>

    @Query("SELECT * FROM sync_queue WHERE entity_id = :entityId AND operation_type = :operationType")
    suspend fun getByEntityAndOperation(entityId: String, operationType: String): SyncQueueEntry?

    @Query("SELECT * FROM sync_queue WHERE id = :id")
    suspend fun getById(id: String): SyncQueueEntry?

    @Query("SELECT * FROM sync_queue WHERE depends_on = :dependencyId")
    suspend fun getDependents(dependencyId: String): List<SyncQueueEntry>

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'failed') AND attempts < max_attempts")
    fun getPendingCount(): Flow<Int>

    @Query("""
        SELECT * FROM sync_queue
        WHERE status IN ('pending', 'failed')
        AND last_error IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
    """)
    fun observeFailingEntries(): Flow<List<SyncQueueEntry>>

    @Insert
    suspend fun insert(entry: SyncQueueEntry)

    @Update
    suspend fun update(entry: SyncQueueEntry)

    @Query("DELETE FROM sync_queue WHERE status = 'completed' AND created_at < :before")
    suspend fun deleteCompleted(before: Long)

    @Query("""
        UPDATE sync_queue
        SET status = 'pending', attempts = 0, next_retry_at = NULL
        WHERE status = 'failed' OR (status = 'pending' AND attempts >= max_attempts)
    """)
    suspend fun resetFailed(): Int
}
