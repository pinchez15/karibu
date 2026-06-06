package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.AdmissionEntity
import kotlinx.coroutines.flow.Flow

/** A census row: the admission plus the time of its most recent observation. */
data class AdmissionCensusRow(
    @Embedded val admission: AdmissionEntity,
    @androidx.room.ColumnInfo(name = "last_observed_at") val lastObservedAt: String?,
)

@Dao
interface AdmissionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: AdmissionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<AdmissionEntity>)

    @Query("UPDATE admissions SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT a.*, (
            SELECT MAX(o.observed_at) FROM admission_observations o
            WHERE o.admission_id = a.id
        ) AS last_observed_at
        FROM admissions a
        WHERE a.clinic_id = :clinicId AND a.status = 'active'
        ORDER BY a.admitted_at DESC
        """,
    )
    fun observeCensus(clinicId: String): Flow<List<AdmissionCensusRow>>

    /** One-shot census for the obs-overdue worker (no Flow). */
    @Query(
        """
        SELECT a.*, (
            SELECT MAX(o.observed_at) FROM admission_observations o
            WHERE o.admission_id = a.id
        ) AS last_observed_at
        FROM admissions a
        WHERE a.clinic_id = :clinicId AND a.status = 'active'
        ORDER BY a.admitted_at DESC
        """,
    )
    suspend fun activeCensusOnce(clinicId: String): List<AdmissionCensusRow>

    @Query("SELECT * FROM admissions WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<AdmissionEntity?>

    @Query("SELECT * FROM admissions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): AdmissionEntity?

    /** Active admissions present locally, to reconcile a census refresh. */
    @Query("SELECT id FROM admissions WHERE clinic_id = :clinicId AND status = 'active'")
    suspend fun activeIds(clinicId: String): List<String>

    @Query("DELETE FROM admissions WHERE id = :id")
    suspend fun deleteById(id: String)

    /** Local optimistic discharge — leaves the active census; syncs via outbox. */
    @Query(
        """
        UPDATE admissions
        SET status = :status, outcome = :outcome, disposition = :disposition,
            discharge_notes = :notes, is_synced = 0
        WHERE id = :id
        """,
    )
    suspend fun dischargeLocal(
        id: String,
        status: String,
        outcome: String?,
        disposition: String?,
        notes: String?,
    )
}
