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
        AND (
             replace(lower(coalesce(whatsapp_number, '')), ' ', '') LIKE '%' || replace(lower(:query), ' ', '') || '%'
             OR lower(coalesce(display_name, '')) LIKE '%' || lower(:query) || '%'
             OR lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) LIKE '%' || lower(:query) || '%'
             OR lower(coalesce(first_name, '')) LIKE '%' || lower(:query) || '%'
             OR lower(coalesce(last_name, '')) LIKE '%' || lower(:query) || '%'
        )
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

    // Offline-only fallback: exact name + exact DOB match against the local
    // cache. The primary duplicate-detection path is now the
    // rpc_find_duplicate_candidates RPC (migration 038), which does
    // trigram-based fuzzy matching across name + location + age and runs
    // server-side. Kept here so we still have a hard-stop check when the device
    // has no network and the clinician is re-registering a patient who was
    // already entered earlier on the same device.
    @Query("""
        SELECT * FROM patients
        WHERE clinic_id = :clinicId
          AND date_of_birth = :dateOfBirth
          AND first_name = :firstName COLLATE NOCASE
          AND last_name = :lastName COLLATE NOCASE
        ORDER BY created_at DESC
        LIMIT 1
    """)
    suspend fun findLikelyDuplicate(clinicId: String, firstName: String, lastName: String, dateOfBirth: String): PatientEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(patient: PatientEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(patients: List<PatientEntity>)

    @Query("SELECT COUNT(*) FROM patients WHERE clinic_id = :clinicId AND is_synced = 0")
    suspend fun getUnsyncedCount(clinicId: String): Int
}
