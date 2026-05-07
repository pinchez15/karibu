package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PatientVitalsEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PatientVitalsDao {
    @Query("SELECT * FROM patient_vitals WHERE patient_id = :patientId ORDER BY recorded_at DESC")
    fun getByPatient(patientId: String): Flow<List<PatientVitalsEntity>>

    @Query("SELECT * FROM patient_vitals WHERE visit_id = :visitId ORDER BY recorded_at DESC")
    fun getByVisit(visitId: String): Flow<List<PatientVitalsEntity>>

    @Query("SELECT * FROM patient_vitals WHERE visit_id = :visitId ORDER BY recorded_at DESC LIMIT 1")
    suspend fun getLatestByVisitOnce(visitId: String): PatientVitalsEntity?

    @Query("SELECT * FROM patient_vitals WHERE id = :id")
    suspend fun getByIdOnce(id: String): PatientVitalsEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PatientVitalsEntity)

    @Query("UPDATE patient_vitals SET is_synced = :isSynced WHERE id = :id")
    suspend fun updateSyncState(id: String, isSynced: Boolean)
}
