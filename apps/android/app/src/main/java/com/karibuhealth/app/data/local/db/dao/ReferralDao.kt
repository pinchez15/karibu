package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.ReferralEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ReferralDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ReferralEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<ReferralEntity>)

    @Query("UPDATE referrals SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("""
        SELECT * FROM referrals
        WHERE clinic_id = :clinicId
          AND status = 'active'
          AND created_at >= :startOfDayIso
        ORDER BY created_at DESC
    """)
    fun observeActiveToday(clinicId: String, startOfDayIso: String): Flow<List<ReferralEntity>>

    @Query("SELECT * FROM referrals WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): ReferralEntity?
}
