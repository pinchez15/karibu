package com.karibuhealth.app.data.repository

import androidx.room.withTransaction
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.*
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.FindDuplicateCandidatesRequest
import com.karibuhealth.app.data.remote.dto.toRpcRequest
import com.karibuhealth.app.data.sync.PatientMerge
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.data.remote.dto.GetPatientLatestVitalsRequest
import com.karibuhealth.app.data.remote.dto.GetPatientTimelineRequest
import com.karibuhealth.app.domain.model.DuplicateCandidate
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientLatestVitals
import com.karibuhealth.app.domain.model.PatientTimelineEvent
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
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val directWriteExecutor: DirectWriteExecutor,
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

    /**
     * Offline-only fallback for duplicate detection — exact name + exact DOB
     * against the local Room cache. The primary duplicate-detection path is
     * [findDuplicateCandidates], which calls the rpc_find_duplicate_candidates
     * RPC (migration 038) for trigram-based fuzzy matching server-side. Kept
     * for the offline new-visit registration path.
     */
    suspend fun findLikelyDuplicate(
        clinicId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
    ): Patient? = withContext(Dispatchers.IO) {
        patientDao.findLikelyDuplicate(clinicId, firstName, lastName, dateOfBirth)?.toDomain()
    }

    /**
     * Server-side fuzzy duplicate search. Calls rpc_find_duplicate_candidates
     * (migration 038) which does trigram name similarity + location + ±3-year
     * age band matching and returns ranked candidates with match_reasons.
     *
     * Returns an empty list when offline or on RPC failure — the caller treats
     * that the same as "no duplicates", which is the safe behaviour (the
     * offline [findLikelyDuplicate] can still fire as a fallback in
     * NewVisitViewModel if needed).
     */
    suspend fun findDuplicateCandidates(
        clinicId: String,
        firstName: String,
        lastName: String,
        village: String? = null,
        parish: String? = null,
        age: Int? = null,
        sex: String? = null,
    ): List<DuplicateCandidate> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isConnected()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcFindDuplicateCandidates(
                FindDuplicateCandidatesRequest(
                    clinicId = clinicId,
                    firstName = firstName,
                    lastName = lastName,
                    village = village?.takeIf { it.isNotBlank() },
                    parish = parish?.takeIf { it.isNotBlank() },
                    age = age,
                    sex = sex,
                ),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
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
        birthYear: Int? = null,
        approximateAge: Int? = null,
        ageRecordedAt: String? = null,
        dobPrecision: String = "unknown",
        village: String? = null,
        parish: String? = null,
        subcounty: String? = null,
        district: String? = null,
        guardianName: String? = null,
        guardianRelationship: String? = null,
        nationalId: String? = null,
    ): Pair<Patient, String?> = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        // If the clinician picks "age_estimate" without supplying the recorded
        // timestamp, default to now — the server-side CHECK constraint
        // (patients_dob_precision_consistent) requires age_recorded_at to be
        // non-null in that branch.
        val resolvedAgeRecordedAt = if (dobPrecision == "age_estimate" && ageRecordedAt == null) {
            now
        } else {
            ageRecordedAt
        }
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
            birthYear = birthYear,
            approximateAge = approximateAge,
            ageRecordedAt = resolvedAgeRecordedAt,
            dobPrecision = dobPrecision,
            village = village,
            parish = parish,
            subcounty = subcounty,
            district = district,
            guardianName = guardianName,
            guardianRelationship = guardianRelationship,
            nationalId = nationalId,
            createdAt = now,
            updatedAt = now,
        )

        val createDto = patient.toCreateDto()

        // Local-first write: insert as unsynced.
        patientDao.upsert(patient.toEntity(isSynced = false, localCreatedAt = System.currentTimeMillis()))

        val syncEntryId = UUID.randomUUID().toString()

        if (networkMonitor.isConnected()) {
            try {
                val response = directWriteExecutor.run {
                    supabaseApi.rpcCreatePatient(createDto.toRpcRequest(clientOpId = syncEntryId))
                }
                if (response.isSuccessful) {
                    val serverPatient = supabaseApi.getPatientById("eq.${patient.id}").firstOrNull()
                    if (serverPatient != null) {
                        patientDao.upsert(serverPatient.toEntity(isSynced = true))
                    } else {
                        patientDao.upsert(patient.toEntity(isSynced = true))
                    }
                    return@withContext patient to null
                }
            } catch (_: Exception) {
                // Fall through to queue path
            }
        }

        val syncEntry = SyncQueueEntry(
            id = syncEntryId,
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
        val queuedId = syncQueueHelper.enqueue(syncEntry)
        patient to queuedId
    }

    suspend fun refreshPatients(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            try {
                val remote = supabaseApi.getPatients("eq.$clinicId")
                remote.forEach { dto ->
                    val local = patientDao.getByIdOnce(dto.id)
                    val merged = PatientMerge.mergeRemote(local, dto.toEntity(isSynced = true))
                    patientDao.upsert(merged)
                }
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

    /**
     * Patient timeline (Phase 3). Calls rpc_get_patient_timeline on the
     * server and unpacks the JSON event_data into typed
     * [PatientTimelineEvent] subtypes.
     *
     * Phase 3 is online-only — offline timeline derivation from Room would
     * be a future enhancement (entries live across visits / notes / vitals /
     * payments and span the entire patient history, not just locally cached
     * rows). Returns an empty list when offline or on RPC failure; the
     * ViewModel surfaces "Couldn't load timeline" in that case.
     *
     * `cursor` is exclusive: pass the oldest eventAt from the previous page
     * to fetch the next.
     */
    suspend fun getPatientTimeline(
        patientId: String,
        cursor: String? = null,
        limit: Int = 50,
    ): List<PatientTimelineEvent> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isConnected()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcGetPatientTimeline(
                GetPatientTimelineRequest(
                    patientId = patientId,
                    cursor = cursor,
                    limit = limit,
                ),
            ).mapNotNull { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    /**
     * Latest-known vital values for a patient. Each measurement is resolved
     * independently — weight may be from today, height from a month ago.
     * Online-only for the same reason as [getPatientTimeline]; returns null
     * on failure so the UI can fall back to "Latest vitals unavailable".
     */
    suspend fun getPatientLatestVitals(patientId: String): PatientLatestVitals? =
        withContext(Dispatchers.IO) {
            if (!networkMonitor.isConnected()) return@withContext null
            runCatching {
                supabaseApi.rpcGetPatientLatestVitals(
                    GetPatientLatestVitalsRequest(patientId = patientId),
                ).firstOrNull()?.toDomain()
            }.getOrNull()
        }
}
