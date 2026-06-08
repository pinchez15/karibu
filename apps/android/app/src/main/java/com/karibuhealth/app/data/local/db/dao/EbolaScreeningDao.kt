package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.EbolaScreeningEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface EbolaScreeningDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: EbolaScreeningEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<EbolaScreeningEntity>)

    @Query("UPDATE ebola_screenings SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("SELECT * FROM ebola_screenings WHERE visit_id = :visitId ORDER BY created_at DESC LIMIT 1")
    fun observeLatestForVisit(visitId: String): Flow<EbolaScreeningEntity?>
}
