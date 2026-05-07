package com.karibuhealth.app.data.repository

import androidx.room.withTransaction
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.*
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PatientRepository @Inject constructor(
    private val database: KaribuDatabase,
    private val patientDao: PatientDao,
    private val syncQueueDao: SyncQueueDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    fun searchPatients(clinicId: String, query: String): Flow<List<Patient>> =
        patientDao.search(clinicId, query).map { entities -> entities.map { it.toDomain() } }

    fun getPatients(clinicId: String): Flow<List<Patient>> =
        patientDao.getByClinic(clinicId).map { entities -> entities.map { it.toDomain() } }

    fun getPatientById(id: String): Flow<Patient?> =
        patientDao.getById(id).map { it?.toDomain() }

    suspend fun getPatientByIdOnce(id: String): Patient? =
        withContext(Dispatchers.IO) {
            patientDao.getByIdOnce(id)?.toDomain()
        }

    suspend fun lookupByPhone(clinicId: String, phone: String): Patient? =
        withContext(Dispatchers.IO) {
            patientDao.getByPhone(clinicId, phone)?.toDomain()
        }

    suspend fun findLikelyDuplicate(
        clinicId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
    ): Patient? = withContext(Dispatchers.IO) {
        patientDao.findLikelyDuplicate(clinicId, firstName, lastName, dateOfBirth)?.toDomain()
    }

    /**
     * Create a patient. Direct-write to Supabase first when online; fall back
     * to queueing on failure or when offline. Returns the local Patient plus
     * an optional sync entry id for downstream dependents (visit, note, etc.)
     * to chain `dependsOn` against. Null sync id means the row already
     * synced — the dependent doesn't need to wait.
     */
    suspend fun createPatient(
        clinicId: String,
        firstName: String,
        lastName: String,
        whatsappNumber: String? = null,
        dateOfBirth: String? = null,
        sex: String? = null,
    ): Pair<Patient, String?> = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        val patient = Patient(
            id = UUID.randomUUID().toString(),
            clinicId = clinicId,
            patientId = null, // Assigned by server on sync
            patientNumber = null,
            firstName = firstName,
            lastName = lastName,
            displayName = "$firstName $lastName".trim(),
            whatsappNumber = whatsappNumber,
            dateOfBirth = dateOfBirth,
            sex = sex,
            createdAt = now,
            updatedAt = now,
        )

        val createDto = patient.toCreateDto()

        // Local-first write: insert as unsynced.
        patientDao.upsert(patient.toEntity(isSynced = false, localCreatedAt = System.currentTimeMillis()))

        if (networkMonitor.isOnline()) {
            try {
                val result = supabaseApi.createPatient(createDto)
                val serverPatient = result.firstOrNull()
                if (serverPatient != null) {
                    patientDao.upsert(serverPatient.toEntity(isSynced = true))
                } else {
                    patientDao.upsert(patient.toEntity(isSynced = true))
                }
                return@withContext patient to null
            } catch (_: Exception) {
                // Fall through to queue path
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "create_patient",
            entityType = "patients",
            entityId = patient.id,
            payload = json.encodeToString(
                com.karibuhealth.app.data.remote.dto.PatientCreateDto.serializer(),
                createDto,
            ),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )
        syncQueueDao.insert(syncEntry)
        patient to syncEntry.id
    }

    suspend fun refreshPatients(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            try {
                val remote = supabaseApi.getPatients("eq.$clinicId")
                patientDao.upsertAll(remote.map { it.toEntity(isSynced = true) })
            } catch (_: Exception) {
                // Silently fail -- offline-first means we use cached data
            }
        }
    }

    suspend fun updateFromServer(patientId: String, serverDto: com.karibuhealth.app.data.remote.dto.PatientDto) {
        withContext(Dispatchers.IO) {
            patientDao.upsert(serverDto.toEntity(isSynced = true))
        }
    }
}
