package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.AdmissionCensusRow
import com.karibuhealth.app.data.local.db.dao.AdmissionDao
import com.karibuhealth.app.data.local.db.dao.AdmissionObservationDao
import com.karibuhealth.app.data.local.db.entity.AdmissionEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ActiveAdmissionsRequest
import com.karibuhealth.app.data.remote.dto.AdmissionObservationsRequest
import com.karibuhealth.app.data.remote.dto.AdmitPatientV2Request
import com.karibuhealth.app.data.remote.dto.RecordAdmissionObservationRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Offline-first inpatient ward (migration 053). Admissions and rounds
 * observations are written to Room first and queued through the outbox, so the
 * ward census works and the 2am no-signal labour admission succeeds. Mirrors the
 * [ReferralRepository] offline-write pattern.
 */
@Singleton
class InpatientRepository @Inject constructor(
    private val admissionDao: AdmissionDao,
    private val admissionObservationDao: AdmissionObservationDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    fun observeCensus(clinicId: String): Flow<List<AdmissionCensusRow>> =
        admissionDao.observeCensus(clinicId)

    fun observeAdmission(id: String): Flow<AdmissionEntity?> =
        admissionDao.observeById(id)

    fun observeObservations(admissionId: String): Flow<List<AdmissionObservationEntity>> =
        admissionObservationDao.observeForAdmission(admissionId)

    suspend fun refreshCensus(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcActiveAdmissions(ActiveAdmissionsRequest(clinicId))
                admissionDao.upsertAll(
                    remote.map { dto ->
                        AdmissionEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            patientName = dto.patientName,
                            dateOfBirth = dto.dateOfBirth,
                            sex = dto.sex,
                            ward = dto.ward,
                            bedLabel = dto.bedLabel,
                            admissionType = dto.admissionType,
                            chiefComplaint = dto.chiefComplaint,
                            weightKg = dto.weightKg,
                            admittedAt = dto.admittedAt,
                            status = "active",
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun refreshObservations(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcAdmissionObservations(
                    AdmissionObservationsRequest(admissionId),
                )
                admissionObservationDao.upsertAll(
                    remote.map { dto ->
                        AdmissionObservationEntity(
                            id = dto.id,
                            admissionId = dto.admissionId,
                            clinicId = dto.clinicId,
                            patientId = dto.patientId,
                            observedAt = dto.observedAt,
                            tempC = dto.tempC,
                            pulseBpm = dto.pulseBpm,
                            respRate = dto.respRate,
                            bpSystolic = dto.bpSystolic,
                            bpDiastolic = dto.bpDiastolic,
                            spo2Pct = dto.spo2Pct,
                            avpu = dto.avpu,
                            imciNotFeeding = dto.imciNotFeeding,
                            imciVomitingEverything = dto.imciVomitingEverything,
                            imciConvulsions = dto.imciConvulsions,
                            imciLethargicUnconscious = dto.imciLethargicUnconscious,
                            note = dto.note,
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    /** Admit a patient offline-first. Returns the local admission id immediately. */
    suspend fun admit(
        clinicId: String,
        patientId: String,
        patientName: String?,
        dateOfBirth: String?,
        sex: String?,
        ward: String,
        bedLabel: String?,
        chiefComplaint: String?,
        admissionType: String?,
        weightKg: Double?,
        maternity: MaternityAdmission? = null,
    ): String = withContext(Dispatchers.IO) {
        val admissionId = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = AdmissionEntity(
            id = admissionId,
            clinicId = clinicId,
            patientId = patientId,
            patientName = patientName,
            dateOfBirth = dateOfBirth,
            sex = sex,
            ward = ward,
            bedLabel = bedLabel?.takeIf { it.isNotBlank() },
            admissionType = admissionType?.takeIf { it.isNotBlank() },
            chiefComplaint = chiefComplaint?.takeIf { it.isNotBlank() },
            weightKg = weightKg,
            gravida = maternity?.gravida,
            para = maternity?.para,
            edd = maternity?.edd,
            gestationWeeks = maternity?.gestationWeeks,
            hivStatus = maternity?.hivStatus,
            presentingStatus = maternity?.presentingStatus,
            admittedAt = now,
            status = "active",
            isSynced = false,
        )
        val request = AdmitPatientV2Request(
            patientId = patientId,
            ward = ward,
            bedLabel = entity.bedLabel,
            chiefComplaint = entity.chiefComplaint,
            admissionType = entity.admissionType,
            weightKg = weightKg,
            gravida = maternity?.gravida,
            para = maternity?.para,
            edd = maternity?.edd,
            gestationWeeks = maternity?.gestationWeeks,
            hivStatus = maternity?.hivStatus,
            presentingStatus = maternity?.presentingStatus,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_admit_patient_v2",
            entityType = "admission",
            entityId = admissionId,
            payload = json.encodeToString(
                AdmitPatientV2Request.serializer(),
                request.copy(clientOpId = admissionId),
            ),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )

        admissionDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcAdmitPatientV2(request.copy(clientOpId = admissionId))
            if (resp.isSuccessful) admissionDao.markSynced(admissionId) else throw IllegalStateException(
                "rpc_admit_patient_v2 HTTP ${resp.code()}",
            )
        }
        admissionId
    }

    /** Record a rounds observation offline-first. Returns the local observation id. */
    suspend fun recordObservation(
        clinicId: String,
        admissionId: String,
        patientId: String,
        observedAt: String,
        tempC: Double?,
        pulseBpm: Int?,
        respRate: Int?,
        bpSystolic: Int?,
        bpDiastolic: Int?,
        spo2Pct: Int?,
        avpu: String?,
        imciNotFeeding: Boolean,
        imciVomitingEverything: Boolean,
        imciConvulsions: Boolean,
        imciLethargicUnconscious: Boolean,
        note: String?,
    ): String = withContext(Dispatchers.IO) {
        val obsId = UUID.randomUUID().toString()
        val entity = AdmissionObservationEntity(
            id = obsId,
            admissionId = admissionId,
            clinicId = clinicId,
            patientId = patientId,
            observedAt = observedAt,
            tempC = tempC,
            pulseBpm = pulseBpm,
            respRate = respRate,
            bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic,
            spo2Pct = spo2Pct,
            avpu = avpu?.takeIf { it.isNotBlank() },
            imciNotFeeding = imciNotFeeding,
            imciVomitingEverything = imciVomitingEverything,
            imciConvulsions = imciConvulsions,
            imciLethargicUnconscious = imciLethargicUnconscious,
            note = note?.takeIf { it.isNotBlank() },
            isSynced = false,
        )
        val request = RecordAdmissionObservationRequest(
            id = obsId,
            admissionId = admissionId,
            observedAt = observedAt,
            tempC = tempC,
            pulseBpm = pulseBpm,
            respRate = respRate,
            bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic,
            spo2Pct = spo2Pct,
            avpu = entity.avpu,
            imciNotFeeding = imciNotFeeding,
            imciVomitingEverything = imciVomitingEverything,
            imciConvulsions = imciConvulsions,
            imciLethargicUnconscious = imciLethargicUnconscious,
            note = entity.note,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_admission_observation",
            entityType = "admission_observation",
            entityId = obsId,
            payload = json.encodeToString(
                RecordAdmissionObservationRequest.serializer(),
                request.copy(clientOpId = obsId),
            ),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )

        admissionObservationDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordAdmissionObservation(request.copy(clientOpId = obsId))
            if (resp.isSuccessful) admissionObservationDao.markSynced(obsId) else throw IllegalStateException(
                "rpc_record_admission_observation HTTP ${resp.code()}",
            )
        }
        obsId
    }

    /** Try the RPC immediately when online; otherwise (or on failure) enqueue the outbox row. */
    private suspend fun pushOrQueue(syncEntry: SyncQueueEntry, push: suspend () -> Unit) {
        if (networkMonitor.isOnline()) {
            val ok = runCatching { push() }.isSuccess
            if (!ok) syncQueueHelper.enqueue(syncEntry)
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
    }

    /** Minimal maternity fields captured at admission; never gate the write. */
    data class MaternityAdmission(
        val gravida: Int? = null,
        val para: Int? = null,
        val edd: String? = null,
        val gestationWeeks: Int? = null,
        val hivStatus: String? = null,
        val presentingStatus: String? = null,
    )
}
