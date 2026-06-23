package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.IvInfusionCheckEntity
import com.karibuhealth.app.data.local.db.entity.IvInfusionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface IvInfusionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: IvInfusionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<IvInfusionEntity>)

    @Query("UPDATE iv_infusions SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE iv_infusions SET active = 0, stopped_at = :stoppedAt WHERE id = :id")
    suspend fun deactivateLocal(id: String, stoppedAt: String)

    @Query(
        "SELECT * FROM iv_infusions WHERE admission_id = :admissionId ORDER BY active DESC, started_at DESC",
    )
    fun observeForAdmission(admissionId: String): Flow<List<IvInfusionEntity>>
}

@Dao
interface IvInfusionCheckDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: IvInfusionCheckEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<IvInfusionCheckEntity>)

    @Query("UPDATE iv_infusion_checks SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        "SELECT * FROM iv_infusion_checks WHERE admission_id = :admissionId ORDER BY checked_at DESC",
    )
    fun observeForAdmission(admissionId: String): Flow<List<IvInfusionCheckEntity>>
}
