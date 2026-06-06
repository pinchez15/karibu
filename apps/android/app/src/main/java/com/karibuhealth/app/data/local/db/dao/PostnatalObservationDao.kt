package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PostnatalObservationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PostnatalObservationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PostnatalObservationEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<PostnatalObservationEntity>)

    @Query("UPDATE postnatal_observations SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM postnatal_observations
        WHERE admission_id = :admissionId
        ORDER BY observed_at DESC
        """,
    )
    fun observeForAdmission(admissionId: String): Flow<List<PostnatalObservationEntity>>
}
