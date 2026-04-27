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
        patientDao.getByIdOnce(id)?.toDomain()

    suspend fun lookupByPhone(clinicId: String, phone: String): Patient? =
        patientDao.getByPhone(clinicId, phone)?.toDomain()

    suspend fun findLikelyDuplicate(
        clinicId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
    ): Patient? = patientDao.findLikelyDuplicate(clinicId, firstName, lastName, dateOfBirth)?.toDomain()

    suspend fun createPatient(
        clinicId: String,
        firstName: String,
        lastName: String,
        whatsappNumber: String? = null,
        dateOfBirth: String? = null,
        sex: String? = null,
    ): Patient = withContext(Dispatchers.IO) {
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

        val entity = patient.toEntity(isSynced = false, localCreatedAt = System.currentTimeMillis())
        val createDto = patient.toCreateDto()
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

        database.withTransaction {
            patientDao.upsert(entity)
            syncQueueDao.insert(syncEntry)
        }

        patient
    }

    suspend fun refreshPatients(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        try {
            val remote = supabaseApi.getPatients("eq.$clinicId")
            patientDao.upsertAll(remote.map { it.toEntity(isSynced = true) })
        } catch (_: Exception) {
            // Silently fail -- offline-first means we use cached data
        }
    }

    suspend fun updateFromServer(patientId: String, serverDto: com.karibuhealth.app.data.remote.dto.PatientDto) {
        patientDao.upsert(serverDto.toEntity(isSynced = true))
    }
}
