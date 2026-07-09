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

    @Query("SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY created_at ASC")
    suspend fun getActiveForReconciliation(): List<SyncQueueEntry>

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

    /**
     * Active (not yet durably synced) outbox entries for a given entity,
     * excluding the entry currently being processed. Used to decide whether
     * it's safe to flip `is_synced = true` on the local row — if any sibling
     * op is still in flight, the row stays dirty so pull-merge can't clobber
     * the local changes that sibling carries.
     */
    @Query("""
        SELECT COUNT(*) FROM sync_queue
        WHERE entity_id = :entityId
        AND id != :excludeId
        AND status IN ('pending', 'in_progress', 'failed')
        AND attempts < max_attempts
    """)
    suspend fun countActiveForEntity(entityId: String, excludeId: String = ""): Int

    /**
     * Recover entries stranded at 'in_progress' by process death or worker
     * cancellation mid-run. The engine is the only writer, so anything still
     * in_progress at the START of a run is stale and safe to retry.
     */
    @Query("UPDATE sync_queue SET status = 'pending' WHERE status = 'in_progress'")
    suspend fun resetInProgress(): Int

    /** Entries that exhausted retries — invisible to getPendingCount/observePending. */
    @Query("SELECT COUNT(*) FROM sync_queue WHERE status = 'failed' AND attempts >= max_attempts")
    fun getTerminallyFailedCount(): Flow<Int>

    @Query("""
        SELECT * FROM sync_queue
        WHERE status = 'failed' AND attempts >= max_attempts
        ORDER BY created_at ASC
    """)
    fun observeTerminallyFailed(): Flow<List<SyncQueueEntry>>

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

    /**
     * Streams every queue entry still counted as pending or failed, so the
     * sync details UI can show clinicians exactly what's stuck (operation,
     * attempts, last error). The count query [getPendingCount] is the
     * authoritative source for the banner number; this list mirrors it.
     */
    @Query("""
        SELECT * FROM sync_queue
        WHERE status IN ('pending', 'failed')
        AND attempts < max_attempts
        ORDER BY created_at ASC
    """)
    fun observePending(): Flow<List<SyncQueueEntry>>

    @Query("""
        SELECT COUNT(*) FROM sync_queue sq
        WHERE sq.status IN ('pending', 'failed') AND sq.attempts < sq.max_attempts
        AND (
            sq.entity_id = :patientId
            OR sq.entity_id IN (SELECT id FROM visits WHERE patient_id = :patientId)
            OR sq.entity_id IN (SELECT id FROM provider_notes WHERE patient_id = :patientId)
            OR sq.entity_id IN (SELECT id FROM patient_vitals WHERE patient_id = :patientId)
            OR sq.entity_id IN (SELECT id FROM payments WHERE patient_id = :patientId)
            OR sq.entity_id IN (SELECT id FROM patient_notes WHERE visit_id IN (
                SELECT id FROM visits WHERE patient_id = :patientId
            ))
        )
    """)
    fun getPendingCountForPatient(patientId: String): Flow<Int>

    @Query("""
        SELECT COUNT(*) FROM sync_queue sq
        WHERE sq.status IN ('pending', 'failed') AND sq.attempts < sq.max_attempts
        AND (
            sq.entity_id = :visitId
            OR sq.entity_id IN (SELECT id FROM provider_notes WHERE visit_id = :visitId)
            OR sq.entity_id IN (SELECT id FROM patient_vitals WHERE visit_id = :visitId)
            OR sq.entity_id IN (SELECT id FROM patient_notes WHERE visit_id = :visitId)
            OR sq.entity_id IN (SELECT patient_id FROM visits WHERE id = :visitId)
        )
    """)
    fun getPendingCountForVisit(visitId: String): Flow<Int>

    /**
     * Escape hatch: mark a single queue entry as completed without
     * re-attempting the RPC. The user invokes this from the sync details
     * sheet when they've verified the data already landed on the server
     * (e.g., the patient/visit shows up in the web app). Avoids the
     * "9 items pending forever" bug when a queue entry's underlying
     * payload has already been written by some other path.
     */
    @Query("UPDATE sync_queue SET status = 'completed' WHERE id = :id")
    suspend fun forceComplete(id: String)

    @Query("""
        UPDATE sync_queue
        SET status = 'pending', attempts = 0, last_error = NULL, next_retry_at = NULL
        WHERE depends_on = :parentId AND status = 'failed' AND last_error LIKE 'blocked:%'
    """)
    suspend fun reviveBlockedDependents(parentId: String): Int
}
