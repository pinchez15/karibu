package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.local.db.entity.VisitWithDetails
import kotlinx.coroutines.flow.Flow

@Dao
interface VisitDao {
    @Query("SELECT * FROM visits WHERE clinic_id = :clinicId AND visit_date = :date ORDER BY checked_in_at DESC")
    fun getTodayVisits(clinicId: String, date: String): Flow<List<VisitEntity>>

    @Transaction
    @Query("SELECT * FROM visits WHERE clinic_id = :clinicId AND visit_date = :date ORDER BY queue_position ASC")
    fun getTodayQueue(clinicId: String, date: String): Flow<List<VisitWithPatient>>

    @Transaction
    @Query("SELECT * FROM visits WHERE doctor_id = :doctorId ORDER BY created_at DESC LIMIT :limit")
    fun getRecentByDoctor(doctorId: String, limit: Int = 20): Flow<List<VisitWithPatient>>

    @Query("SELECT * FROM visits WHERE id = :id")
    fun getById(id: String): Flow<VisitEntity?>

    @Query("SELECT * FROM visits WHERE id = :id")
    suspend fun getByIdOnce(id: String): VisitEntity?

    @Transaction
    @Query("SELECT * FROM visits WHERE id = :id")
    fun getWithDetails(id: String): Flow<VisitWithDetails?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(visit: VisitEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(visits: List<VisitEntity>)

    @Query("UPDATE visits SET status = :status, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, updatedAt: String)

    @Query("UPDATE visits SET queue_status = :queueStatus, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateQueueStatus(id: String, queueStatus: String, updatedAt: String)

    @Query("SELECT COUNT(*) FROM visits WHERE clinic_id = :clinicId AND is_synced = 0")
    suspend fun getUnsyncedCount(clinicId: String): Int
}
