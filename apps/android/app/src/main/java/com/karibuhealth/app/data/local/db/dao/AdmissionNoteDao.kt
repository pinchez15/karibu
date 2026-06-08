package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.AdmissionNoteEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AdmissionNoteDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: AdmissionNoteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<AdmissionNoteEntity>)

    @Query("UPDATE admission_notes SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM admission_notes
        WHERE admission_id = :admissionId
        ORDER BY created_at DESC
        """,
    )
    fun observeForAdmission(admissionId: String): Flow<List<AdmissionNoteEntity>>
}
