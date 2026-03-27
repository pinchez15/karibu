package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.ClinicEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ClinicDao {
    @Query("SELECT * FROM clinics WHERE id = :id")
    fun getById(id: String): Flow<ClinicEntity?>

    @Query("SELECT * FROM clinics WHERE id = :id")
    suspend fun getByIdOnce(id: String): ClinicEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(clinic: ClinicEntity)
}
