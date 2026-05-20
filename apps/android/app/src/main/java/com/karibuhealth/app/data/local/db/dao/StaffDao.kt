package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.StaffEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface StaffDao {
    @Query("SELECT * FROM staff WHERE clerk_user_id = :clerkUserId AND is_active = 1")
    fun getByClerkUserId(clerkUserId: String): Flow<StaffEntity?>

    @Query("SELECT * FROM staff WHERE clerk_user_id = :clerkUserId AND is_active = 1")
    suspend fun getByClerkUserIdOnce(clerkUserId: String): StaffEntity?

    @Query("SELECT * FROM staff WHERE id = :id LIMIT 1")
    suspend fun getByIdOnce(id: String): StaffEntity?

    @Query("SELECT * FROM staff WHERE clinic_id = :clinicId AND is_active = 1")
    fun getByClinic(clinicId: String): Flow<List<StaffEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(staff: StaffEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(staff: List<StaffEntity>)
}
