package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PatientConsentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConsentDao {
    @Query("SELECT * FROM patient_consents WHERE patient_id = :patientId AND visit_id = :visitId")
    fun getByPatientAndVisit(patientId: String, visitId: String): Flow<List<PatientConsentEntity>>

    @Query("SELECT * FROM patient_consents WHERE visit_id = :visitId")
    suspend fun getByVisitOnce(visitId: String): List<PatientConsentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(consent: PatientConsentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(consents: List<PatientConsentEntity>)

    @Query("SELECT COUNT(*) FROM patient_consents WHERE is_synced = 0")
    suspend fun getUnsyncedCount(): Int
}
