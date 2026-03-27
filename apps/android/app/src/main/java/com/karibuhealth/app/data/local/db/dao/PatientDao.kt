package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PatientEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PatientDao {
    @Query("SELECT * FROM patients WHERE clinic_id = :clinicId ORDER BY display_name")
    fun getByClinic(clinicId: String): Flow<List<PatientEntity>>

    @Query("""
        SELECT * FROM patients
        WHERE clinic_id = :clinicId
        AND (whatsapp_number LIKE '%' || :query || '%'
             OR display_name LIKE '%' || :query || '%'
             OR patient_number LIKE '%' || :query || '%')
        ORDER BY display_name
        LIMIT 50
    """)
    fun search(clinicId: String, query: String): Flow<List<PatientEntity>>

    @Query("SELECT * FROM patients WHERE id = :id")
    fun getById(id: String): Flow<PatientEntity?>

    @Query("SELECT * FROM patients WHERE id = :id")
    suspend fun getByIdOnce(id: String): PatientEntity?

    @Query("SELECT * FROM patients WHERE clinic_id = :clinicId AND whatsapp_number = :phone")
    suspend fun getByPhone(clinicId: String, phone: String): PatientEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(patient: PatientEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(patients: List<PatientEntity>)

    @Query("SELECT COUNT(*) FROM patients WHERE clinic_id = :clinicId AND is_synced = 0")
    suspend fun getUnsyncedCount(clinicId: String): Int
}
