package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toCreateDto
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PatientVitalsDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.PatientVitalsCreateDto
import com.karibuhealth.app.domain.model.PatientVitals
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
class VitalsRepository @Inject constructor(
    private val patientVitalsDao: PatientVitalsDao,
    private val syncQueueDao: SyncQueueDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val authTokenStore: AuthTokenStore,
    private val json: Json,
) {
    fun getByPatient(patientId: String): Flow<List<PatientVitals>> =
        patientVitalsDao.getByPatient(patientId).map { list -> list.map { it.toDomain() } }

    fun getByVisit(visitId: String): Flow<List<PatientVitals>> =
        patientVitalsDao.getByVisit(visitId).map { list -> list.map { it.toDomain() } }

    suspend fun getLatestForVisit(visitId: String): PatientVitals? =
        withContext(Dispatchers.IO) {
            patientVitalsDao.getLatestByVisitOnce(visitId)?.toDomain()
        }

    private suspend fun getPendingVisitSyncDependency(visitId: String?): String? {
        if (visitId == null) return null
        return syncQueueDao.getByEntityAndOperation(visitId, "create_visit")
            ?.takeIf { it.status != "completed" }
            ?.id
    }

    /**
     * Record a vitals reading. Patient is required; visit_id is optional
     * (inpatient longitudinal pattern allows readings against a patient
     * without an owning visit). Direct-write via rpc_insert_patient_vitals
     * when online + no upstream queue prerequisite. Returns (vitals, syncEntryId?).
     */
    suspend fun recordVitals(
        patientId: String,
        visitId: String?,
        weightKg: Double? = null,
        heightCm: Double? = null,
        tempC: Double? = null,
        bpSystolic: Int? = null,
        bpDiastolic: Int? = null,
        pulseBpm: Int? = null,
        respRate: Int? = null,
        spo2Pct: Int? = null,
        muacCm: Double? = null,
        notes: String? = null,
        predecessorSyncId: String? = null,
    ): Pair<PatientVitals, String?> = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        val staffId = authTokenStore.getStaffId()
        val vitals = PatientVitals(
            id = UUID.randomUUID().toString(),
            patientId = patientId,
            visitId = visitId,
            recordedAt = now,
            recordedBy = staffId,
            weightKg = weightKg,
            heightCm = heightCm,
            tempC = tempC,
            bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic,
            pulseBpm = pulseBpm,
            respRate = respRate,
            spo2Pct = spo2Pct,
            muacCm = muacCm,
            notes = notes,
        )
        patientVitalsDao.upsert(vitals.toEntity(isSynced = false))

        val rpcBody = vitals.toCreateDto()
        val effectivePredecessor = predecessorSyncId ?: getPendingVisitSyncDependency(visitId)

        if (networkMonitor.isOnline() && effectivePredecessor == null) {
            try {
                val response = supabaseApi.rpcInsertPatientVitals(rpcBody)
                if (response.isSuccessful) {
                    patientVitalsDao.updateSyncState(vitals.id, true)
                    return@withContext vitals to null
                }
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "insert_patient_vitals",
            entityType = "patient_vitals",
            entityId = vitals.id,
            payload = json.encodeToString(PatientVitalsCreateDto.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = effectivePredecessor,
        )
        syncQueueDao.insert(syncEntry)
        vitals to syncEntry.id
    }
}
