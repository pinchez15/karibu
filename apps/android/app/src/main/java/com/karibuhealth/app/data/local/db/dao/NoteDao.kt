package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PatientNoteEntity
import com.karibuhealth.app.data.local.db.entity.ProviderNoteEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProviderNoteDao {
    @Query("SELECT * FROM provider_notes WHERE visit_id = :visitId")
    fun getByVisitId(visitId: String): Flow<ProviderNoteEntity?>

    @Query("SELECT * FROM provider_notes WHERE visit_id = :visitId")
    suspend fun getByVisitIdOnce(visitId: String): ProviderNoteEntity?

    // Migration 039: notes can be standalone (no visit_id). The sign / amend
    // / void RPCs key off id, so we need lookup-by-id for the autosave +
    // Sign split.
    @Query("SELECT * FROM provider_notes WHERE id = :id")
    suspend fun getByIdOnce(id: String): ProviderNoteEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: ProviderNoteEntity)

    @Query("""
        UPDATE provider_notes
        SET structured_data = :structuredData,
            updated_at = :updatedAt
        WHERE visit_id = :visitId
    """)
    suspend fun updateStructuredData(visitId: String, structuredData: String?, updatedAt: String)

    // Local mirror of the server-side lifecycle transitions. Status flips
    // immediately so the UI reflects the new state; the actual server-side
    // write happens through rpcSignProviderNote / amend / void (online) or
    // gets queued by SyncEngine (offline).
    @Query("""
        UPDATE provider_notes
        SET status = :status,
            finalized_at = COALESCE(:finalizedAt, finalized_at),
            finalized_by = COALESCE(:finalizedBy, finalized_by),
            amended_at = COALESCE(:amendedAt, amended_at),
            amended_by = COALESCE(:amendedBy, amended_by),
            voided_at = COALESCE(:voidedAt, voided_at),
            voided_by = COALESCE(:voidedBy, voided_by),
            void_reason = COALESCE(:voidReason, void_reason),
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updateLifecycle(
        id: String,
        status: String,
        finalizedAt: String?,
        finalizedBy: String?,
        amendedAt: String?,
        amendedBy: String?,
        voidedAt: String?,
        voidedBy: String?,
        voidReason: String?,
        updatedAt: String,
    )
}

@Dao
interface PatientNoteDao {
    /**
     * All patient notes for a visit (post migration 032 there can be up to
     * two: one clinician_fallback, one ai_generated).
     */
    @Query("SELECT * FROM patient_notes WHERE visit_id = :visitId")
    fun getAllByVisit(visitId: String): Flow<List<PatientNoteEntity>>

    @Query("SELECT * FROM patient_notes WHERE visit_id = :visitId AND source = :source LIMIT 1")
    fun getByVisitAndSource(visitId: String, source: String): Flow<PatientNoteEntity?>

    @Query("SELECT * FROM patient_notes WHERE visit_id = :visitId AND source = :source LIMIT 1")
    suspend fun getByVisitAndSourceOnce(visitId: String, source: String): PatientNoteEntity?

    /**
     * Compatibility alias — returns the clinician_fallback row if present, else
     * the AI row, else null. Used by callers that want "the canonical patient
     * note for this visit" without caring about source.
     */
    @Query("""
        SELECT * FROM patient_notes
        WHERE visit_id = :visitId
        ORDER BY CASE source WHEN 'clinician_fallback' THEN 0 ELSE 1 END
        LIMIT 1
    """)
    fun getByVisitId(visitId: String): Flow<PatientNoteEntity?>

    @Query("""
        SELECT * FROM patient_notes
        WHERE visit_id = :visitId
        ORDER BY CASE source WHEN 'clinician_fallback' THEN 0 ELSE 1 END
        LIMIT 1
    """)
    suspend fun getByVisitIdOnce(visitId: String): PatientNoteEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: PatientNoteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(notes: List<PatientNoteEntity>)
}
