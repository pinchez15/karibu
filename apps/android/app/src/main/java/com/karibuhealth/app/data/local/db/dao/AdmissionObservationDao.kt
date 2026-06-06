package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AdmissionObservationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: AdmissionObservationEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<AdmissionObservationEntity>)

    @Query("UPDATE admission_observations SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM admission_observations
        WHERE admission_id = :admissionId
        ORDER BY observed_at DESC
        """,
    )
    fun observeForAdmission(admissionId: String): Flow<List<AdmissionObservationEntity>>
}
